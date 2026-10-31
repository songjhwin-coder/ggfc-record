#!/usr/bin/env python3
"""GGFC administrator recovery v2. --diagnose and --check are read-only.

Uses Cloud Shell credentials, an explicit quota project, and sanitized diagnostics.
Does not store or print passwords, access tokens, raw API errors, or password hashes.
"""
import argparse
import getpass
import json
import re
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ADMIN_EMAIL = 'ggfc-admin@example.com'
PERMISSIONS = ('firebaseauth.users.get', 'firebaseauth.users.update', 'serviceusage.services.use')
KNOWN_CODES = {
    'PERMISSION_DENIED', 'UNAUTHENTICATED', 'INVALID_ARGUMENT', 'NOT_FOUND',
    'SERVICE_DISABLED', 'API_DISABLED', 'SERVICE_NOT_ACTIVATED', 'USER_PROJECT_DENIED',
    'CONSUMER_INVALID', 'BILLING_DISABLED', 'PROJECT_DELETED', 'PROJECT_INVALID',
    'IAM_PERMISSION_DENIED', 'ACCESS_DENIED', 'ACCESS_TOKEN_EXPIRED',
    'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'CREDENTIALS_MISSING', 'CREDENTIALS_INVALID',
    'ACCOUNT_STATE_INVALID', 'SECURITY_POLICY_VIOLATED', 'RATE_LIMIT_EXCEEDED',
    'RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED', 'PASSWORD_DOES_NOT_MEET_REQUIREMENTS',
    'WEAK_PASSWORD', 'OPERATION_NOT_ALLOWED', 'USER_NOT_FOUND',
}


class RecoveryError(RuntimeError):
    pass


def gcloud_output(arguments):
    try:
        result = subprocess.run(['gcloud', *arguments], capture_output=True, text=True, check=True, timeout=45)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        raise RecoveryError('Google 인증 확인 실패. Cloud Shell에서 프로젝트 관리용 Google 계정으로 gcloud auth login 후 다시 실행하세요.') from None


def access_token():
    token = gcloud_output(['auth', 'print-access-token'])
    if not token or any(c.isspace() for c in token):
        raise RecoveryError('Google 인증 정보를 확인하지 못했습니다. gcloud auth login 후 다시 실행하세요.')
    return token


def check_project(project):
    if not re.fullmatch(r'[a-z][a-z0-9-]{4,61}[a-z0-9]', project):
        raise RecoveryError('Firebase 프로젝트 ID를 확인하세요.')


def describe_http_error(error, operation):
    try:
        raw = json.loads(error.read(65536)).get('error') or {}
    except (ValueError, OSError, TypeError, AttributeError):
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    codes = []
    status = raw.get('status')
    if isinstance(status, str) and status in KNOWN_CODES:
        codes.append(status)
    details = raw.get('details') or []
    for detail in details if isinstance(details, list) else []:
        if isinstance(detail, dict) and isinstance(detail.get('reason'), str) and detail['reason'] in KNOWN_CODES and detail['reason'] not in codes:
            codes.append(detail['reason'])
    # Google legacy errors sometimes carry the only explanation in message. Classify
    # known patterns locally; never echo that message or any request credential.
    message = str(raw.get('message') or '').lower()
    if 'quota project' in message or 'serviceusage.services.use' in message:
        category = 'QUOTA_PROJECT'
        hint = '프로젝트 사용 권한(serviceusage.services.use) 또는 요청 프로젝트 설정을 확인하세요. 수정 도구는 프로젝트 헤더를 포함합니다.'
    elif any(x in codes for x in ('SERVICE_DISABLED', 'API_DISABLED', 'SERVICE_NOT_ACTIVATED')) or 'has not been used in project' in message or 'api is disabled' in message:
        category = 'API_DISABLED'
        hint = 'Google Cloud의 API 및 서비스에서 해당 API 사용 설정을 확인하세요. 관리자 계정 비밀번호는 아직 변경되지 않았을 수 있습니다.'
    elif any(x in codes for x in ('USER_PROJECT_DENIED', 'CONSUMER_INVALID')):
        category = 'QUOTA_PROJECT'
        hint = '이 Google 계정의 프로젝트 사용 권한(serviceusage.services.use)과 프로젝트 ID를 확인하세요.'
    elif error.code == 401 or any(x in codes for x in ('UNAUTHENTICATED', 'ACCESS_TOKEN_EXPIRED', 'CREDENTIALS_INVALID', 'CREDENTIALS_MISSING')):
        category = 'AUTHENTICATION'
        hint = 'Google 인증을 새로 확인해야 합니다. 프로젝트 관리 계정으로 gcloud auth login 후 다시 실행하세요.'
    elif 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' in codes:
        category = 'AUTH_SCOPE'
        hint = 'Google 인증 범위가 부족합니다. 프로젝트 관리 계정으로 gcloud auth login 후 다시 확인하세요.'
    elif ('end user credentials' in message or 'gcloud oauth client' in message or 'unsupported credentials' in message):
        category = 'CREDENTIAL_TYPE'
        hint = '이 API가 현재 Google 인증 방식을 허용하지 않았습니다. 프로젝트 관리자가 지원되는 OAuth 또는 서비스 계정 방식으로 복구해야 합니다.'
    elif error.code == 403:
        category = 'PERMISSION_OR_POLICY'
        hint = '권한 또는 조직 정책에 의해 거절됐습니다. --diagnose의 Firebase 사용자 조회·변경 권한 결과를 확인하세요. 이 오류만으로 권한 부족을 확정할 수 없습니다.'
    elif error.code == 400:
        category = 'REQUEST_OR_PASSWORD_POLICY'
        hint = '프로젝트 설정과 새 비밀번호 정책을 확인하세요.'
    else:
        category = 'SERVER_ERROR'
        hint = '서버 상태와 프로젝트 설정을 확인하세요.'
    label = {'lookup':'관리자 계정 조회', 'update':'비밀번호 갱신', 'permissions':'프로젝트 권한 확인'}[operation]
    service = 'cloudresourcemanager.googleapis.com' if operation == 'permissions' else 'identitytoolkit.googleapis.com'
    return RecoveryError('작업: '+label+'\nAPI: '+service+'\nHTTP: '+str(error.code)+'\n오류 코드: '+(', '.join(codes) if codes else '확인되지 않음')+'\n진단 분류: '+category+'\n안내: '+hint)


def request_json(project, token, operation, payload):
    check_project(project)
    if operation in ('lookup', 'update'):
        url = 'https://identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:'+operation
    elif operation == 'permissions':
        url = 'https://cloudresourcemanager.googleapis.com/v1/projects/'+project+':testIamPermissions'
    else:
        raise RecoveryError('허용되지 않는 요청입니다.')
    request = Request(url, data=json.dumps(payload).encode('utf-8'), method='POST',
                      headers={'Authorization':'Bearer '+token, 'Content-Type':'application/json', 'X-Goog-User-Project':project})
    try:
        with urlopen(request, timeout=45) as response:
            return json.load(response)
    except HTTPError as error:
        raise describe_http_error(error, operation) from None
    except (URLError, TimeoutError, ValueError):
        raise RecoveryError('서버 응답을 확인하지 못했습니다. 비밀번호 갱신 요청 중이었다면 새 비밀번호로 로그인을 먼저 확인하세요.') from None


def auth_api(project, token, operation, payload):
    if operation not in ('lookup','update'):
        raise RecoveryError('허용되지 않는 인증 작업입니다.')
    return request_json(project, token, operation, payload)


def find_admin(project, token):
    users = auth_api(project, token, 'lookup', {'email':[ADMIN_EMAIL]}).get('users') or []
    if len(users) != 1 or users[0].get('email','').lower() != ADMIN_EMAIL or not users[0].get('localId'):
        raise RecoveryError('해당 프로젝트에서 기존 GGFC 관리자 계정을 하나로 확인하지 못했습니다. Firebase Authentication 사용자를 확인하세요.')
    if users[0].get('disabled'):
        raise RecoveryError('관리자 계정이 사용 중지돼 있습니다. Firebase Authentication에서 계정 상태를 먼저 확인하세요.')
    return users[0]['localId']


def diagnose(project, token):
    print('읽기 전용 진단입니다. 비밀번호·권한·API 설정을 변경하지 않습니다.')
    print('대상 프로젝트:', project)
    try:
        account = gcloud_output(['auth','list','--filter=status:ACTIVE','--format=value(account)'])
        print('현재 Google 계정:', account if re.fullmatch(r'[A-Za-z0-9.!#$%&\x27*+/=?^_`{|}~@-]+\.[A-Za-z0-9.-]+',account) and '@' in account else 'gcloud auth list에서 직접 확인하세요.')
    except RecoveryError:
        print('현재 Google 계정: gcloud auth list에서 직접 확인하세요.')
    try:
        allowed = request_json(project, token, 'permissions', {'permissions':list(PERMISSIONS)}).get('permissions') or []
        for permission in PERMISSIONS:
            print(permission+': '+('있음' if permission in allowed else '없음'))
    except RecoveryError as error:
        print('권한 목록 확인 실패. 이것만으로 Firebase 권한이 없다고 단정할 수 없습니다.')
        print(str(error))
    try:
        uid = find_admin(project, token)
        print('관리자 계정 조회: 성공')
        print('관리자 계정:', ADMIN_EMAIL)
        print('기존 UID:', uid)
        return 0
    except RecoveryError as error:
        print('관리자 계정 조회: 실패')
        print(str(error))
        return 1


def main(argv=None):
    parser = argparse.ArgumentParser(description='GGFC 관리자 비밀번호 복구 v2. Google 프로젝트 관리 권한이 필요합니다.')
    parser.add_argument('--project', required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--check',action='store_true',help='관리자 계정 조회만 수행')
    modes.add_argument('--diagnose',action='store_true',help='읽기 전용 Google 계정·프로젝트 권한·오류 진단')
    args = parser.parse_args(argv)
    check_project(args.project)
    token = access_token()
    if args.diagnose:
        return diagnose(args.project,token)
    uid = find_admin(args.project,token)
    print('프로젝트:',args.project)
    print('관리자 계정:',ADMIN_EMAIL)
    print('기존 UID:',uid)
    if args.check:
        print('계정 확인 완료. 비밀번호는 변경하지 않았습니다.')
        return 0
    if not sys.stdin.isatty():
        raise RecoveryError('비밀번호 재설정은 대화형 Cloud Shell에서 직접 실행하세요.')
    password = getpass.getpass('새 관리자 비밀번호 (8~128자, 화면에 표시되지 않음): ')
    confirmation = getpass.getpass('새 비밀번호 확인: ')
    if not 8 <= len(password) <= 128 or password != confirmation:
        raise RecoveryError('비밀번호 길이 또는 확인 값이 올바르지 않습니다. 변경하지 않았습니다.')
    print('위 프로젝트의 기존 관리자 비밀번호만 재설정합니다. 경기 기록·이메일·UID는 유지합니다.')
    if input('진행하려면 RESET_ADMIN 입력: ').strip() != 'RESET_ADMIN':
        print('취소했습니다. 변경하지 않았습니다.')
        return 0
    if find_admin(args.project,token) != uid:
        raise RecoveryError('관리자 계정이 변경돼 작업을 중단했습니다.')
    result = auth_api(args.project,token,'update',{'localId':uid,'password':password})
    password = confirmation = token = ''
    if result.get('localId') != uid:
        raise RecoveryError('서버 변경 결과를 확인하지 못했습니다. 새 비밀번호로 로그인해 확인하세요.')
    print('관리자 비밀번호 재설정 완료. 앱에서 새 비밀번호로 로그인하세요.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (KeyboardInterrupt,EOFError):
        print('\n중단했습니다.',file=sys.stderr)
        raise SystemExit(1)
    except RuntimeError as error:
        print(str(error),file=sys.stderr)
        raise SystemExit(1)
