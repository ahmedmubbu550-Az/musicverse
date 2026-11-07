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

/* MUSICVERSE built-in YouTube search + player */
const YT_KEY_STORE="musicverse-youtube-api-key";
let searchResults=[],searchNextPageToken="",searchCategoryValue="All";
let ytPlayer=null,ytApiReady=false;
window.onYouTubeIframeAPIReady=function(){ytApiReady=true; if(window.pendingMVVideoId) createYouTubePlayer(window.pendingMVVideoId);};
(function loadYouTubeIframeAPI(){
  if(document.querySelector('script[data-mv-youtube-api]'))return;
  const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";s.async=true;s.dataset.mvYoutubeApi="1";document.head.appendChild(s);
})();
function getYoutubeKey(){return localStorage.getItem(YT_KEY_STORE)||"";}
function youtubeTrackFromResult(item){
  const vid=item.id.videoId, existing=state.tracks.find(t=>t.videoId===vid||t.url==="https://www.youtube.com/watch?v="+vid);
  if(existing)return existing;
  return {id:"yt-"+vid,videoId:vid,provider:"youtube",embed:"https://www.youtube-nocookie.com/embed/"+vid,title:item.snippet.title,artist:item.snippet.channelTitle||"YouTube",url:"https://www.youtube.com/watch?v="+vid,category:searchCategoryValue==="All"?"Other":searchCategoryValue,playlistId:"",addedAt:Date.now()};
}
function searchErrorText(payload,status){
  const reason=payload&&payload.error&&payload.error.errors&&payload.error.errors[0]&&payload.error.errors[0].reason;
  if(status===403&&reason==="quotaExceeded")return "YouTube search quota has been reached for this Google Cloud project. Try again after the quota resets or review API quota in Google Cloud.";
  if(status===403)return "Google rejected this API key. Check that YouTube Data API v3 is enabled and the key's website restriction includes https://ahmedmubbu550-az.github.io/*.";
  if(status===400)return "The search request was rejected. Check the API key and try a simpler search.";
  return "Could not load YouTube results. Please check your connection and API key, then try again.";
}
async function runMusicSearch(pageToken){
  const key=getYoutubeKey(),query=$("#musicQuery").value.trim(),genre=$("#musicGenre").value;
  if(!key){$("#apiKeyPanel").hidden=false;$("#searchStatus").textContent="Add your YouTube Data API v3 key in API Key Settings to fetch songs here.";$("#youtubeApiKey").focus();return;}
  if(!query){$("#searchStatus").textContent="Enter a song, artist or album name to search.";return;}
  if(!pageToken){searchResults=[];searchNextPageToken="";$("#musicResults").innerHTML="";$("#searchStatus").textContent="Searching YouTube music…";}
  $("#moreResults").hidden=true;
  const genreTerms={English:" English music",Pakistani:" Pakistani music",Bollywood:" Bollywood Hindi music"};
  const q=query+(genre==="All"?"":genreTerms[genre]||"");
  const params=new URLSearchParams({part:"snippet",type:"video",videoCategoryId:"10",videoEmbeddable:"true",maxResults:"12",regionCode:"IN",safeSearch:"moderate",q,key});
  if(pageToken)params.set("pageToken",pageToken);
  try{
    const response=await fetch("https://www.googleapis.com/youtube/v3/search?"+params.toString());
    const payload=await response.json();
    if(!response.ok){$("#searchStatus").textContent=searchErrorText(payload,response.status);return;}
    const items=(payload.items||[]).filter(x=>x.id&&x.id.videoId&&x.snippet);
    searchResults=pageToken?searchResults.concat(items):items;
    searchNextPageToken=payload.nextPageToken||"";
    renderMusicResults();
    $("#searchStatus").textContent=searchResults.length?("Showing "+searchResults.length+" YouTube music results for “"+query+"”. Select any result to play it here."):"No music videos were found. Try another song or artist name.";
    $("#moreResults").hidden=!searchNextPageToken;
  }catch(err){$("#searchStatus").textContent="Network error while searching YouTube. Check your internet connection and try again.";}
}
function renderMusicResults(){
  $("#musicResults").innerHTML=searchResults.map((item,index)=>{
    const sn=item.snippet||{},thumb=(sn.thumbnails&&(sn.thumbnails.medium||sn.thumbnails.high||sn.thumbnails.default)||{}).url||"";
    return '<article class="music-result"><img class="music-result-thumb" src="'+safeText(thumb)+'" alt="" loading="lazy"><div class="music-result-body"><div class="music-result-title">'+safeText(sn.title||"Untitled video")+'</div><div class="music-result-channel">'+safeText(sn.channelTitle||"YouTube")+'</div><div class="music-result-actions"><button class="primary-btn" type="button" data-play-search="'+index+'">▶ Play here</button><button class="small-action" type="button" data-queue-search="'+index+'" title="Add to library">＋</button></div></div></article>';
  }).join("");
}
function makeSearchQueue(){
  return searchResults.map(youtubeTrackFromResult);
}
function selectSearchResult(index){
  const queue=makeSearchQueue(),track=queue[index];
  if(!track)return;
  setCurrent(track,queue);
}
function addSearchResultToLibrary(index){
  const queue=makeSearchQueue(),track=queue[index];
  if(!track)return;
  if(!state.tracks.some(t=>t.id===track.id))state.tracks.unshift(track);
  localStorage.setItem(STORE,JSON.stringify(state));renderAll();toast("Added to your MUSICVERSE library");
}
function setCurrent(track,queue){
  if(!track)return;
  if(!state.tracks.some(t=>t.id===track.id))state.tracks.unshift(track);
  currentId=track.id;
  currentQueue=queue&&queue.length?queue:[track];
  queueIndex=currentQueue.findIndex(t=>t.id===track.id);
  state.recent=[track.id,...state.recent.filter(x=>x!==track.id)].slice(0,20);
  localStorage.setItem(STORE,JSON.stringify(state));renderAll();
  $("#nowTitle").textContent=track.title;
  $("#nowArtist").textContent=track.artist||track.category;
  $("#nowArt").textContent=track.category==="Pakistani"?"پ":track.category==="Bollywood"?"ब":"♫";
  $("#playPauseBtn").textContent="Ⅱ";
  $("#playerHint").textContent="Now playing · "+track.category;
  showEmbed(track);
}
function showEmbed(track){
  let panel=$("#activeEmbed");
  if(!panel){panel=document.createElement("section");panel.id="activeEmbed";panel.className="content-section embed-panel";$("#recentSection").after(panel);}
  if(ytPlayer&&typeof ytPlayer.destroy==="function"){try{ytPlayer.destroy();}catch(e){}ytPlayer=null;}
  const title=safeText(track.title),artist=safeText(track.artist||"");
  if(track.provider==="youtube"||track.videoId){
    panel.classList.add("youtube");
    panel.innerHTML='<div class="section-heading"><div><div class="eyebrow muted">NOW PLAYING · YOUTUBE</div><h2>'+title+'</h2></div><button class="text-link" id="closeEmbed">CLOSE ×</button></div><p class="embed-title">'+artist+'</p><div id="youtubePlayerMount"></div>';
    $("#closeEmbed").onclick=()=>{if(ytPlayer){ytPlayer.destroy();ytPlayer=null;}panel.remove();};
    window.pendingMVVideoId=track.videoId||parseProvider(track.url)?.videoId;
    if(!window.pendingMVVideoId&&track.url){const parsed=new URL(track.url);window.pendingMVVideoId=parsed.hostname==="youtu.be"?parsed.pathname.slice(1):parsed.searchParams.get("v");}
    if(ytApiReady)createYouTubePlayer(window.pendingMVVideoId);
  }else{
    panel.classList.remove("youtube");
    panel.innerHTML='<div class="section-heading"><div><div class="eyebrow muted">NOW LOADED · SPOTIFY</div><h2>'+title+'</h2></div><button class="text-link" id="closeEmbed">CLOSE ×</button></div><p class="embed-title">'+artist+' · Playback controls are provided by Spotify.</p><iframe src="'+safeText(track.embed)+'" title="'+title+'" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>';
    $("#closeEmbed").onclick=()=>panel.remove();
  }
  panel.scrollIntoView({behavior:"smooth",block:"nearest"});
}
function createYouTubePlayer(videoId){
  if(!videoId||!window.YT||!YT.Player||!$("#youtubePlayerMount"))return;
  if(ytPlayer){try{ytPlayer.destroy();}catch(e){}ytPlayer=null;}
  ytPlayer=new YT.Player("youtubePlayerMount",{height:"360",width:"100%",videoId:videoId,playerVars:{autoplay:1,controls:1,playsinline:1,rel:0,origin:window.location.origin},events:{
    onReady:function(e){e.target.playVideo();},
    onStateChange:function(e){if(e.data===YT.PlayerState.PLAYING)$("#playPauseBtn").textContent="Ⅱ";if(e.data===YT.PlayerState.PAUSED||e.data===YT.PlayerState.ENDED)$("#playPauseBtn").textContent="▶";if(e.data===YT.PlayerState.ENDED){if(repeat)e.target.seekTo(0,true),e.target.playVideo();else moveQueue(1);}},
    onError:function(){toast("This video cannot be embedded. Choose another result.");}
  }});
}
function playTrack(tid){
  const track=state.tracks.find(t=>t.id===tid);if(!track)return;
  const group=state.tracks.filter(t=>t.category===track.category);
  setCurrent(track,group.length?group:[track]);
}
function moveQueue(dir){
  if(!currentQueue||!currentQueue.length)return toast("Search for music or add a song first.");
  if(repeat&&dir===1&&queueIndex===currentQueue.length-1){if(ytPlayer){ytPlayer.seekTo(0,true);ytPlayer.playVideo();}return;}
  if(shuffle&&dir===1&&currentQueue.length>1){let n=queueIndex;while(n===queueIndex)n=Math.floor(Math.random()*currentQueue.length);queueIndex=n;}
  else queueIndex=(queueIndex+dir+currentQueue.length)%currentQueue.length;
  const next=currentQueue[queueIndex];if(next)setCurrent(next,currentQueue);
}
function togglePlayback(){
  if(ytPlayer&&typeof ytPlayer.getPlayerState==="function"){
    if(ytPlayer.getPlayerState()===YT.PlayerState.PLAYING){ytPlayer.pauseVideo();$("#playPauseBtn").textContent="▶";}
    else{ytPlayer.playVideo();$("#playPauseBtn").textContent="Ⅱ";}
  }else if(currentId){$("#activeEmbed")?.scrollIntoView({behavior:"smooth"});toast("Use Spotify's own player controls for this track.");}
  else openModal();
}
function searchCategory(category){
  const terms={English:"English pop music",Pakistani:"Pakistani songs Coke Studio",Bollywood:"Bollywood Hindi songs"};
  $("#musicGenre").value=category;$("#musicQuery").value=terms[category]||category+" music";
  $("#musicSearchSection").scrollIntoView({behavior:"smooth"});
  runMusicSearch("");
}
$("#apiSettingsToggle").onclick=()=>{$("#apiKeyPanel").hidden=!$("#apiKeyPanel").hidden;if(!$("#apiKeyPanel").hidden)$("#youtubeApiKey").focus();};
$("#youtubeApiKey").value=getYoutubeKey();
$("#saveApiKey").onclick=()=>{const key=$("#youtubeApiKey").value.trim();if(!key){toast("Paste your Google API key first.");return;}localStorage.setItem(YT_KEY_STORE,key);$("#apiKeyPanel").hidden=true;toast("YouTube search key saved in this browser.");if($("#musicQuery").value.trim())runMusicSearch("");};
$("#clearApiKey").onclick=()=>{localStorage.removeItem(YT_KEY_STORE);$("#youtubeApiKey").value="";toast("API key removed from this browser.");};
$("#musicSearchForm").addEventListener("submit",e=>{e.preventDefault();runMusicSearch("");});
$("#moreResults").onclick=()=>{if(searchNextPageToken)runMusicSearch(searchNextPageToken);};
$("#playPauseBtn").onclick=togglePlayback;
document.addEventListener("click",e=>{
  const p=e.target.closest("[data-play-search]");if(p)selectSearchResult(Number(p.dataset.playSearch));
  const q=e.target.closest("[data-queue-search]");if(q)addSearchResultToLibrary(Number(q.dataset.queueSearch));
});
if(getYoutubeKey()){$("#searchStatus").textContent="Search YouTube music videos and play selected results here."; }
renderAll();

/* Background playback helper */
(function(){
  function silentWav(){
    const rate=8000,n=rate,buf=new ArrayBuffer(44+n),v=new DataView(buf);
    const w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
    w(0,"RIFF");v.setUint32(4,36+n,true);w(8,"WAVE");w(12,"fmt ");
    v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,rate,true);v.setUint32(28,rate,true);v.setUint16(32,1,true);
    v.setUint16(34,8,true);w(36,"data");v.setUint32(40,n,true);
    for(let i=0;i<n;i++)v.setUint8(44+i,128);
    return URL.createObjectURL(new Blob([buf],{type:"audio/wav"}));
  }
  const keepAlive=new Audio(silentWav());
  keepAlive.loop=true;

  const ms=navigator.mediaSession;
  function setupMediaSession(track){
    if(!ms)return;
    ms.metadata=new MediaMetadata({title:track.title||"MUSICVERSE",artist:track.artist||""});
    ms.setActionHandler("play",()=>{ytPlayer&&ytPlayer.playVideo&&ytPlayer.playVideo();keepAlive.play().catch(()=>{});});
    ms.setActionHandler("pause",()=>{ytPlayer&&ytPlayer.pauseVideo&&ytPlayer.pauseVideo();});
    ms.setActionHandler("nexttrack",()=>$("#nextBtn").click());
    ms.setActionHandler("previoustrack",()=>$("#prevBtn").click());
  }

  const originalSetCurrent=setCurrent;
  setCurrent=function(track,queue){
    originalSetCurrent(track,queue);
    keepAlive.play().catch(()=>{});
    setupMediaSession(track);
  };
})();

   if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js"); }
