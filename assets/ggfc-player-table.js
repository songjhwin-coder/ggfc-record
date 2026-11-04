/* GGFC V3.25.74: document scrolling for Player Stats with aligned column headings. */
(()=>{
 'use strict';
 const box=document.getElementById('playerTable'),view=document.getElementById('v-player');
 if(!box||!view)return;
 const layer=document.createElement('div');layer.id='playerTableStickyHeader';layer.className='player-table-sticky-head';layer.hidden=true;layer.setAttribute('aria-hidden','true');layer.inert=true;document.body.append(layer);
 const topbar=document.getElementById('ggfcTopbar'),preview=document.getElementById('memberPreviewBar');
 let frame=0,dirty=true,sourceHead=null,copy=null,height=0;
 const hide=()=>{if(!layer.hidden)layer.hidden=true;};
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
 const rebuild=()=>{dirty=true;schedule();};
 const observer=new ResizeObserver(rebuild);observer.observe(box);if(topbar)observer.observe(topbar);if(preview)observer.observe(preview);
 function update(){
  frame=0;
  if(!view.classList.contains('on')||view.hidden||document.body.classList.contains('swipe-active')||!box.getClientRects().length){hide();return;}
  const source=box.querySelector('table'),head=source?.tHead;
  if(!head||!box.querySelector('tbody tr:not([hidden])')){hide();return;}
  if(dirty||head!==sourceHead){
   if(head!==sourceHead){if(sourceHead)observer.unobserve(sourceHead);sourceHead=head;observer.observe(head);}
   const cells=[...head.rows[0].cells],widths=cells.map(cell=>cell.getBoundingClientRect().width);
   height=head.getBoundingClientRect().height;
   copy=document.createElement('table');copy.className='player-table-head-copy';copy.style.width=widths.reduce((a,b)=>a+b,0)+'px';copy.style.height=height+'px';
   const cols=document.createElement('colgroup');widths.forEach(width=>{const col=document.createElement('col');col.style.width=width+'px';cols.append(col);});
   const clone=head.cloneNode(true);clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
   const properties=['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','whiteSpace','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTop','borderRight','borderBottom','borderLeft','textAlign','verticalAlign','boxSizing'];
   [...clone.rows[0].cells].forEach((cell,i)=>{const css=getComputedStyle(cells[i]);properties.forEach(k=>cell.style[k]=css[k]);cell.style.width=widths[i]+'px';cell.style.minWidth='0';cell.style.maxWidth='none';});
   copy.append(cols,clone);layer.replaceChildren(copy);dirty=false;
  }
  const rect=box.getBoundingClientRect(),headRect=head.getBoundingClientRect();
  let top=Math.max(0,topbar?.getBoundingClientRect().bottom||0);
  if(preview&&!preview.hidden&&preview.getClientRects().length)top=Math.max(top,preview.getBoundingClientRect().bottom+8);
  if(headRect.top>=top||rect.bottom<=top||rect.width<=0||!height){hide();return;}
  const contentLeft=rect.left+box.clientLeft,left=Math.max(0,contentLeft),right=Math.min(innerWidth,contentLeft+box.clientWidth);
  if(right<=left){hide();return;}
  layer.style.left=left+'px';layer.style.top=Math.min(top,rect.bottom-height)+'px';layer.style.width=(right-left)+'px';layer.style.height=height+'px';
  copy.style.transform='translateX('+(-box.scrollLeft-(left-contentLeft))+'px)';layer.hidden=false;
  // The existing player-name column stays pinned during horizontal scrolling too.
  copy.tHead.rows[0].cells[0].style.transform='translateX('+box.scrollLeft+'px)';
 }
 box.addEventListener('scroll',schedule,{passive:true});window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',rebuild,{passive:true});
 window.visualViewport?.addEventListener('resize',rebuild,{passive:true});
 new MutationObserver(rebuild).observe(box,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 new MutationObserver(schedule).observe(view,{attributes:true,attributeFilter:['class','hidden']});
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
 new MutationObserver(rebuild).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 const main=document.getElementById('mainContent');if(main)new ResizeObserver(schedule).observe(main);
 if(preview)new MutationObserver(schedule).observe(preview,{attributes:true,attributeFilter:['hidden']});
 document.fonts?.ready.then(rebuild);rebuild();
})();
