#!/usr/bin/env python3
"""Recover the existing GGFC administrator in Cloud Shell using project IAM permissions.

No service-account key or third-party package is required. --check only reads the
account. A password write requires interactive input and an explicit confirmation.
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


def access_token():
    try:
        result = subprocess.run(['gcloud', 'auth', 'print-access-token'], capture_output=True, text=True, check=True, timeout=45)
    except (OSError, subprocess.SubprocessError):
        raise RuntimeError('Cloud Shell에서 프로젝트 관리용 Google 계정으로 로그인·인증한 뒤 다시 실행하세요.') from None
    token = result.stdout.strip()
    if not token or any(c.isspace() for c in token):
        raise RuntimeError('Google 인증 정보를 확인하지 못했습니다. Cloud Shell 인증을 다시 확인하세요.')
    return token


def auth_api(project, token, operation, payload):
    if operation not in ('lookup', 'update') or not re.fullmatch(r'[a-z][a-z0-9-]{4,61}[a-z0-9]', project):
        raise RuntimeError('프로젝트 또는 작업 이름이 올바르지 않습니다.')
    request = Request('https://identitytoolkit.googleapis.com/v1/projects/' + project + '/accounts:' + operation,
                      data=json.dumps(payload).encode('utf-8'), method='POST',
                      headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=45) as response:
            return json.load(response)
    except HTTPError as error:
        # Do not print raw error bodies, request data, credentials or tokens.
        if error.code in (401, 403):
            raise RuntimeError('Google 계정 권한이 부족하거나 인증이 만료됐습니다. 해당 프로젝트의 Firebase 사용자 조회·변경 권한을 확인하세요.') from None
        if error.code == 400:
            raise RuntimeError('요청이 거절됐습니다. 프로젝트 설정과 새 비밀번호 정책을 확인하세요.') from None
        raise RuntimeError('Firebase 요청이 실패했습니다. 서버 상태와 프로젝트를 확인하세요.') from None
    except (URLError, TimeoutError, ValueError):
        raise RuntimeError('서버 응답을 확인하지 못했습니다. 재설정 요청 중이었다면 새 비밀번호로 로그인되는지 먼저 확인하세요.') from None


def find_admin(project, token):
    response = auth_api(project, token, 'lookup', {'email': [ADMIN_EMAIL]})
    users = response.get('users') or []
    if len(users) != 1 or users[0].get('email', '').lower() != ADMIN_EMAIL or not users[0].get('localId'):
        raise RuntimeError('해당 프로젝트에서 기존 GGFC 관리자 계정을 하나로 확인하지 못했습니다. Firebase Authentication의 사용자를 확인하세요.')
    if users[0].get('disabled'):
        raise RuntimeError('관리자 계정이 사용 중지돼 있습니다. Firebase Authentication에서 계정 상태를 먼저 확인하세요.')
    return users[0]['localId']


def main(argv=None):
    parser = argparse.ArgumentParser(description='GGFC 관리자 비밀번호 복구. Firebase 프로젝트 관리자만 실행할 수 있습니다.')
    parser.add_argument('--project', required=True, help='기존 앱의 Firebase 프로젝트 ID')
    parser.add_argument('--check', action='store_true', help='계정 확인만 수행. 비밀번호를 변경하지 않음')
    args = parser.parse_args(argv)
    if not re.fullmatch(r'[a-z][a-z0-9-]{4,61}[a-z0-9]', args.project):
        raise RuntimeError('Firebase 프로젝트 ID를 확인하세요.')
    token = access_token()
    uid = find_admin(args.project, token)
    print('프로젝트:', args.project)
    print('관리자 계정:', ADMIN_EMAIL)
    print('기존 UID:', uid)
    if args.check:
        print('계정 확인 완료. 비밀번호는 변경하지 않았습니다.')
        return 0
    if not sys.stdin.isatty():
        raise RuntimeError('비밀번호 재설정은 대화형 Cloud Shell에서 직접 실행하세요. 비밀번호를 명령어나 파일에 적지 마세요.')
    password = getpass.getpass('새 관리자 비밀번호 (8~128자, 화면에 표시되지 않음): ')
    confirmation = getpass.getpass('새 비밀번호 확인: ')
    if not 8 <= len(password) <= 128 or password != confirmation:
        raise RuntimeError('비밀번호 길이 또는 확인 값이 올바르지 않습니다. 변경하지 않았습니다.')
    print('위 프로젝트의 기존 관리자 계정 비밀번호만 재설정합니다. 경기 기록·이메일·UID는 유지합니다.')
    if input('진행하려면 RESET_ADMIN 입력: ').strip() != 'RESET_ADMIN':
        print('취소했습니다. 변경하지 않았습니다.')
        return 0
    # Re-check the identity immediately before the write; never delete or replace the account.
    if find_admin(args.project, token) != uid:
        raise RuntimeError('관리자 계정이 변경돼 작업을 중단했습니다.')
    response = auth_api(args.project, token, 'update', {'localId': uid, 'password': password})
    password = confirmation = token = ''
    if response.get('localId') != uid:
        raise RuntimeError('서버의 변경 결과를 확인하지 못했습니다. 새 비밀번호로 로그인해 결과를 확인하세요.')
    print('관리자 비밀번호 재설정 완료. 앱에서 새 비밀번호로 로그인하세요.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (KeyboardInterrupt, EOFError):
        print('\n중단했습니다.', file=sys.stderr)
        raise SystemExit(1)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
