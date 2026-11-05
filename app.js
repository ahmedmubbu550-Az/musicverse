const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const STORE = "musicverse-v1";
let state = loadState();
let currentId = null, currentQueue = [], queueIndex = -1, shuffle = false, repeat = false, toastTimer;

function loadState(){
  try { return JSON.parse(localStorage.getItem(STORE)) || {tracks:[],playlists:[],recent:[],favorites:[]}; }
  catch { return {tracks:[],playlists:[],recent:[],favorites:[]}; }
}
function save(){ localStorage.setItem(STORE, JSON.stringify(state)); renderAll(); }
function id(){ return Math.random().toString(36).slice(2,10); }
function toast(message){ const el=$("#toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2200); }
function openModal(){ $("#modalBackdrop").classList.add("open"); $("#formError").textContent=""; $("#trackTitle").focus(); }
function closeModal(){ $("#modalBackdrop").classList.remove("open"); }
function safeText(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function parseProvider(raw){
  try {
    const u=new URL(raw);
    if(u.hostname==="open.spotify.com" || u.hostname==="www.open.spotify.com"){
      const match=u.pathname.match(/^\/(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]+)$/);
      if(!match) return null;
      return {provider:"spotify",embed:`https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator`};
    }
    if(["youtube.com","www.youtube.com","m.youtube.com","youtu.be","music.youtube.com"].includes(u.hostname)){
      let video=u.hostname==="youtu.be"?u.pathname.slice(1):u.searchParams.get("v");
      let list=u.searchParams.get("list");
      if(video && /^[A-Za-z0-9_-]{6,}$/.test(video)) return {provider:"youtube",embed:`https://www.youtube-nocookie.com/embed/${video}${list?`?list=${encodeURIComponent(list)}`:""}`};
      if(list && /^[A-Za-z0-9_-]+$/.test(list)) return {provider:"youtube",embed:`https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}`};
    }
  } catch {}
  return null;
}
function addTrack(data){
  const track={id:id(),title:data.title.trim(),artist:data.artist.trim()||"Unknown artist",url:data.url.trim(),category:data.category,playlistId:data.playlistId||"",addedAt:Date.now()};
  const parsed=parseProvider(track.url); if(!parsed) return false;
  Object.assign(track,parsed); state.tracks.unshift(track);
  if(track.playlistId && !state.playlists.some(p=>p.id===track.playlistId)) track.playlistId="";
  save(); return track;
}
function renderPlaylists(){
  $("#playlistNav").innerHTML=state.playlists.length?state.playlists.map(p=>`<button class="playlist-link" data-playlist="${p.id}">♫ &nbsp;${safeText(p.name)}</button>`).join(""):'<div class="playlist-empty">No playlists yet. Create one with +</div>';
  const sel=$("#trackPlaylist"); sel.innerHTML='<option value="">All songs only</option>'+state.playlists.map(p=>`<option value="${p.id}">${safeText(p.name)}</option>`).join("");
}
function renderRecent(){
  const items=state.recent.map(tid=>state.tracks.find(t=>t.id===tid)).filter(Boolean).slice(0,6);
  const el=$("#recentList");
  if(!items.length){el.className="track-list empty-state";el.innerHTML='<div class="empty-icon">♫</div><div><strong>Your next favourite starts here.</strong><p>Add a Spotify or YouTube link to start listening.</p></div>';return;}
  el.className="track-list"; el.innerHTML=items.map(trackRow).join("");
}
function trackRow(t){
  const fav=state.favorites.includes(t.id);
  return `<div class="track-row"><div class="track-thumb">♫</div><div class="track-info"><strong>${safeText(t.title)}</strong><small>${safeText(t.artist)}</small></div><span class="track-category">${safeText(t.category)}</span><div class="track-actions"><button class="small-action" data-play="${t.id}" title="Play">▶</button><button class="small-action" data-fav="${t.id}" title="Favorite">${fav?"♥":"♡"}</button><button class="small-action" data-delete="${t.id}" title="Remove">×</button></div></div>`;
}
function renderLibrary(){
  $("#librarySummary").innerHTML=`<div class="summary-card"><strong>${state.tracks.length}</strong><span>SONGS ADDED</span></div><div class="summary-card"><strong>${state.playlists.length}</strong><span>PLAYLISTS</span></div><div class="summary-card"><strong>${state.favorites.length}</strong><span>FAVORITES</span></div>`;
}
function renderAll(){renderPlaylists();renderRecent();renderLibrary();updateFavoriteButton();}
function updateFavoriteButton(){const t=state.tracks.find(x=>x.id===currentId);$("#favoriteCurrent").textContent=t&&state.favorites.includes(t.id)?"♥":"♡";}
function setCurrent(track,queue=null){
  if(!track)return;
  currentId=track.id; currentQueue=queue||[track.id]; queueIndex=currentQueue.indexOf(track.id);
  $("#nowTitle").textContent=track.title; $("#nowArtist").textContent=track.artist; $("#nowArt").textContent=track.category==="Pakistani"?"پ":track.category==="Bollywood"?"ब":"♫";
  $("#playPauseBtn").textContent="↗"; $("#playerHint").textContent="Now loaded in the embedded player below";
  state.recent=[track.id,...state.recent.filter(x=>x!==track.id)].slice(0,20); save();
  showEmbed(track);
}
function showEmbed(track){
  let panel=$("#activeEmbed"); if(!panel){panel=document.createElement("section");panel.id="activeEmbed";panel.className="content-section embed-panel";$("#recentSection").after(panel);}
  panel.innerHTML=`<div class="section-heading"><div><div class="eyebrow muted">NOW LOADED</div><h2>${safeText(track.title)}</h2></div><button class="text-link" id="closeEmbed">CLOSE ×</button></div><p class="embed-title">${safeText(track.artist)} · ${safeText(track.category)} · Powered by ${track.provider==="spotify"?"Spotify":"YouTube"}</p><div class="${track.provider}"><iframe src="${track.embed}" title="${safeText(track.title)}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  $("#closeEmbed").onclick=()=>panel.remove();
  panel.scrollIntoView({behavior:"smooth",block:"nearest"});
}
function moveQueue(dir){
  if(!currentQueue.length)return toast("Add a song to your queue first.");
  if(repeat && dir===1 && queueIndex===currentQueue.length-1){const t=state.tracks.find(x=>x.id===currentId);if(t)showEmbed(t);return;}
  if(shuffle && dir===1 && currentQueue.length>1){let n=queueIndex;while(n===queueIndex)n=Math.floor(Math.random()*currentQueue.length);queueIndex=n;}
  else queueIndex=(queueIndex+dir+currentQueue.length)%currentQueue.length;
  const t=state.tracks.find(x=>x.id===currentQueue[queueIndex]); if(t)setCurrent(t,currentQueue);
}
function playTrack(tid){
  const track=state.tracks.find(t=>t.id===tid); if(!track)return;
  const group=state.tracks.filter(t=>t.category===track.category).map(t=>t.id);
  setCurrent(track,group.length?group:[track.id]);
}
function toggleFavorite(tid){
  state.favorites=state.favorites.includes(tid)?state.favorites.filter(x=>x!==tid):[...state.favorites,tid];save();toast(state.favorites.includes(tid)?"Added to favorites":"Removed from favorites");
}
function createPlaylist(){
  const name=prompt("Name your new playlist:");
  if(!name||!name.trim())return;
  state.playlists.push({id:id(),name:name.trim(),createdAt:Date.now()});save();toast("Playlist created");
}
function showPlaylist(pid){
  const p=state.playlists.find(x=>x.id===pid);if(!p)return;
  const tracks=state.tracks.filter(t=>t.playlistId===pid);
  const section=$("#recentSection");section.innerHTML=`<div class="eyebrow muted">YOUR COLLECTION</div><h2>${safeText(p.name)}</h2><p class="view-description">${tracks.length} songs in this playlist. Add tracks using the + button.</p><div class="track-list" style="margin-top:16px">${tracks.length?tracks.map(trackRow).join(""):'<div class="empty-state"><div class="empty-icon">♫</div><div><strong>This playlist is waiting for its first song.</strong><p>Add a song and select this playlist.</p></div></div>'}</div><button class="ghost-btn" id="renamePlaylist" style="margin-top:15px">Rename playlist</button> <button class="ghost-btn" id="deletePlaylist" style="margin-top:15px">Delete playlist</button>`;
  $("#renamePlaylist").onclick=()=>{const n=prompt("New playlist name:",p.name);if(n&&n.trim()){p.name=n.trim();save();showPlaylist(pid);}};
  $("#deletePlaylist").onclick=()=>{if(confirm(`Delete "${p.name}"? Songs will remain in your library.`)){state.playlists=state.playlists.filter(x=>x.id!==pid);state.tracks.forEach(t=>{if(t.playlistId===pid)t.playlistId="";});save();location.reload();}};
  section.scrollIntoView({behavior:"smooth"});
}
function searchCategory(category){
  const terms={English:"English pop hits",Pakistani:"Pakistani music Coke Studio",Bollywood:"Bollywood Hindi songs"}[category];
  const query=encodeURIComponent(terms);
  $("#recentSection").innerHTML=`<div class="eyebrow muted">DISCOVER · ${category.toUpperCase()}</div><h2>${category} <em>music</em></h2><p class="view-description">Find music on your preferred streaming service, then add a track or playlist link to MUSICVERSE.</p><div class="search-results"><div class="search-result"><strong>Search ${category} on Spotify</strong><a target="_blank" rel="noopener" href="https://open.spotify.com/search/${query}">OPEN SPOTIFY ↗</a></div><div class="search-result"><strong>Search ${category} on YouTube</strong><a target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${query}">OPEN YOUTUBE ↗</a></div></div><button class="primary-btn" id="categoryAdd" style="margin-top:18px">＋ Add a ${category} song <b>↗</b></button>`;
  $("#categoryAdd").onclick=()=>{$("#trackCategory").value=category;openModal();};
  $("#recentSection").scrollIntoView({behavior:"smooth"});
}
$("#createPlaylist").onclick=createPlaylist;$("#addFirstBtn").onclick=openModal;$("#exploreBtn").onclick=()=>$("#discoverSection").scrollIntoView({behavior:"smooth"});$("#allCategories").onclick=()=>$("#discoverSection").scrollIntoView({behavior:"smooth"});
$("#modalClose").onclick=closeModal;$("#modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeModal();});
$("#addTrackForm").addEventListener("submit",e=>{
  e.preventDefault();const data={title:$("#trackTitle").value,artist:$("#trackArtist").value,url:$("#trackUrl").value,category:$("#trackCategory").value,playlistId:$("#trackPlaylist").value};
  const parsed=parseProvider(data.url);if(!parsed){$("#formError").textContent="Please paste a valid Spotify track/album/playlist or YouTube video/playlist URL.";return;}
  const track=addTrack(data);if(track){$("#addTrackForm").reset();closeModal();toast("Added to your MUSICVERSE library");playTrack(track.id);}
});
document.addEventListener("click",e=>{
  const play=e.target.closest("[data-play]");if(play)playTrack(play.dataset.play);
  const fav=e.target.closest("[data-fav]");if(fav)toggleFavorite(fav.dataset.fav);
  const del=e.target.closest("[data-delete]");if(del){const tid=del.dataset.delete;state.tracks=state.tracks.filter(t=>t.id!==tid);state.favorites=state.favorites.filter(x=>x!==tid);state.recent=state.recent.filter(x=>x!==tid);if(currentId===tid){currentId=null;$("#nowTitle").textContent="Nothing playing yet";$("#nowArtist").textContent="Add a streaming link to begin";$("#activeEmbed")?.remove();}save();toast("Song removed");}
  const pl=e.target.closest("[data-playlist]");if(pl)showPlaylist(pl.dataset.playlist);
});
$$(".category-card").forEach(b=>b.addEventListener("click",()=>searchCategory(b.dataset.category)));
$("#favoriteCurrent").onclick=()=>{if(currentId)toggleFavorite(currentId);else toast("Choose a song first");};
$("#prevBtn").onclick=()=>moveQueue(-1);$("#nextBtn").onclick=()=>moveQueue(1);
$("#playPauseBtn").onclick=()=>{if(currentId){$("#activeEmbed")?.scrollIntoView({behavior:"smooth"});toast("Use the embedded provider player to play or pause");}else openModal();};
$("#shuffleBtn").onclick=()=>{shuffle=!shuffle;$("#shuffleBtn").classList.toggle("active",shuffle);toast(shuffle?"Shuffle on":"Shuffle off");};
$("#repeatBtn").onclick=()=>{repeat=!repeat;$("#repeatBtn").classList.toggle("active",repeat);toast(repeat?"Repeat on":"Repeat off");};
$("#clearRecent").onclick=()=>{state.recent=[];save();toast("Recently played cleared");};
$$(".nav-item").forEach(b=>b.addEventListener("click",()=>{
  $$(".nav-item").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  if(b.dataset.view==="home")location.reload();
  if(b.dataset.view==="search")$("#discoverSection").scrollIntoView({behavior:"smooth"});
  if(b.dataset.view==="library")$("#librarySection").scrollIntoView({behavior:"smooth"});
}));
$("#backBtn").onclick=()=>window.history.back();$("#forwardBtn").onclick=()=>window.history.forward();
$("#year").textContent=new Date().getFullYear();renderAll();