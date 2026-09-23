(()=>{
 const params=new URLSearchParams(location.search),week=Number(params.get('week'));
 if([3,4,5,7,15,16,18].includes(week)){const target=new URL('/workspace/',location.origin);target.searchParams.set('week',week);if(week===3&&params.get('section')==='personal')target.searchParams.set('section','personal');location.replace(target);return;}
 document.querySelector('#reloadCatalog')?.addEventListener('click',()=>{const frame=document.querySelector('#newGallery');frame.src=frame.src;});
 const classroom=document.querySelector('#upload'),compact=matchMedia('(max-width:700px)');
 const layout=()=>{classroom.open=!compact.matches||location.hash==='#upload';};layout();compact.addEventListener('change',layout);document.querySelectorAll('a[href="#upload"]').forEach(a=>a.addEventListener('click',()=>{classroom.open=true;}));
})();
