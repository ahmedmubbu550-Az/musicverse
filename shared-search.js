/* MUSICVERSE shared search: browser calls our Vercel API, never Google directly. */
localStorage.removeItem("musicverse-youtube-api-key");
$("#searchStatus").textContent="Search is shared for everyone. No personal API key is needed.";
getYoutubeKey=()=> "";

youtubeTrackFromResult=function(item){
  const videoId=item?.id?.videoId;
  const existing=state.tracks.find(t=>t.videoId===videoId||t.url==="https://www.youtube.com/watch?v="+videoId);
  if(existing)return existing;
  return {id:"yt-"+videoId,videoId,provider:"youtube",embed:"https://www.youtube-nocookie.com/embed/"+videoId,
    title:item.snippet.title,artist:item.snippet.channelTitle||"YouTube",
    url:"https://www.youtube.com/watch?v="+videoId,
    category:$("#musicGenre").value==="All"?"Other":$("#musicGenre").value,playlistId:"",addedAt:Date.now()};
};

runMusicSearch=async function(pageToken){
  const query=$("#musicQuery").value.trim(),genre=$("#musicGenre").value;
  if(query.length<2){$("#searchStatus").textContent="Enter at least two characters to search.";return;}
  if(!pageToken){searchResults=[];searchNextPageToken="";$("#musicResults").innerHTML="";$("#searchStatus").textContent="Searching music…";}
  $("#moreResults").hidden=true;
  const params=new URLSearchParams({q:query,genre});if(pageToken)params.set("pageToken",pageToken);
  try{
    const response=await fetch("/api/search?"+params.toString(),{headers:{Accept:"application/json"}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){$("#searchStatus").textContent=payload.error||"Music search is temporarily unavailable.";return;}
    const items=(payload.items||[]).filter(x=>x?.id?.videoId&&x?.snippet);
    searchResults=pageToken?searchResults.concat(items):items;searchNextPageToken=payload.nextPageToken||"";
    renderMusicResults();
    $("#searchStatus").textContent=searchResults.length?"Showing "+searchResults.length+" results for “"+query+"”. Select a result to play it here.":"No music videos found. Try another title or artist.";
    $("#moreResults").hidden=!searchNextPageToken;
  }catch{$("#searchStatus").textContent="Could not reach MUSICVERSE search. Check your connection and try again.";}
};

renderMusicResults=function(){
  $("#musicResults").innerHTML=searchResults.map((item,index)=>{
    const s=item.snippet||{},t=s.thumbnails||{},thumb=(t.medium||t.high||t.default||{}).url||"";
    return '<article class="music-result"><img class="music-result-thumb" src="'+safeText(thumb)+'" alt="" loading="lazy"><div class="music-result-body"><div class="music-result-title">'+safeText(s.title||"Untitled video")+'</div><div class="music-result-channel">'+safeText(s.channelTitle||"YouTube")+'</div><div class="music-result-actions"><button class="primary-btn" type="button" data-play-search="'+index+'">▶ Play here</button><button class="small-action" type="button" data-queue-search="'+index+'" title="Add to library">＋</button></div></div></article>';
  }).join("");
};

makeSearchQueue=()=>searchResults.map(youtubeTrackFromResult);
selectSearchResult=index=>{const q=makeSearchQueue();if(q[index])setCurrent(q[index],q);};
addSearchResultToLibrary=index=>{
  const t=makeSearchQueue()[index];if(!t)return;
  if(!state.tracks.some(x=>x.id===t.id))state.tracks.unshift(t);
  localStorage.setItem(STORE,JSON.stringify(state));renderAll();toast("Added to your MUSICVERSE library");
};

setCurrent=function(track,queue){
  if(!track)return;if(!state.tracks.some(t=>t.id===track.id))state.tracks.unshift(track);
  currentId=track.id;currentQueue=queue&&queue.length?queue:[track];queueIndex=currentQueue.findIndex(t=>t.id===track.id);
  state.recent=[track.id,...state.recent.filter(x=>x!==track.id)].slice(0,20);
  localStorage.setItem(STORE,JSON.stringify(state));renderAll();
  $("#nowTitle").textContent=track.title;$("#nowArtist").textContent=track.artist||track.category;
  $("#nowArt").textContent=track.category==="Pakistani"?"پ":track.category==="Bollywood"?"ब":"♫";
  $("#playPauseBtn").textContent="Ⅱ";$("#playerHint").textContent="Now playing · "+track.category;showEmbed(track);
};

videoIdForTrack=function(t){
  if(t.videoId)return t.videoId;
  try{const u=new URL(t.url);return u.hostname==="youtu.be"?u.pathname.slice(1):u.searchParams.get("v");}catch{return null;}
};

showEmbed=function(track){
  let panel=$("#activeEmbed");
  if(!panel){panel=document.createElement("section");panel.id="activeEmbed";panel.className="content-section embed-panel";$("#recentSection").after(panel);}
  if(ytPlayer){try{ytPlayer.destroy();}catch{}ytPlayer=null;}
  const title=safeText(track.title),artist=safeText(track.artist||"");
  if(track.provider==="youtube"||track.videoId||videoIdForTrack(track)){
    panel.classList.add("youtube");
    panel.innerHTML='<div class="section-heading"><div><div class="eyebrow muted">NOW PLAYING · YOUTUBE</div><h2>'+title+'</h2></div><button class="text-link" id="closeEmbed">CLOSE ×</button></div><p class="embed-title">'+artist+'</p><div id="youtubePlayerMount"></div>';
    $("#closeEmbed").onclick=()=>{if(ytPlayer){ytPlayer.destroy();ytPlayer=null;}panel.remove();};
    window.pendingMVVideoId=videoIdForTrack(track);if(ytApiReady)createYouTubePlayer(window.pendingMVVideoId);
  }else{
    panel.classList.remove("youtube");
    panel.innerHTML='<div class="section-heading"><div><div class="eyebrow muted">NOW LOADED · SPOTIFY</div><h2>'+title+'</h2></div><button class="text-link" id="closeEmbed">CLOSE ×</button></div><p class="embed-title">'+artist+' · Playback controls are provided by Spotify.</p><iframe src="'+safeText(track.embed)+'" title="'+title+'" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>';
    $("#closeEmbed").onclick=()=>panel.remove();
  }
  panel.scrollIntoView({behavior:"smooth",block:"nearest"});
};

createYouTubePlayer=function(videoId){
  if(!videoId||!window.YT||!window.YT.Player||!$("#youtubePlayerMount"))return;
  if(ytPlayer){try{ytPlayer.destroy();}catch{}}
  ytPlayer=new YT.Player("youtubePlayerMount",{height:"360",width:"100%",videoId,
    playerVars:{autoplay:1,controls:1,playsinline:1,rel:0},
    events:{
      onReady:e=>e.target.playVideo(),
      onStateChange:e=>{
        if(e.data===YT.PlayerState.PLAYING)$("#playPauseBtn").textContent="Ⅱ";
        if(e.data===YT.PlayerState.PAUSED||e.data===YT.PlayerState.ENDED)$("#playPauseBtn").textContent="▶";
        if(e.data===YT.PlayerState.ENDED){if(repeat){e.target.seekTo(0,true);e.target.playVideo();}else moveQueue(1);}
      },
      onError:()=>toast("This video cannot be embedded. Please choose another result.")
    }
  });
};

playTrack=function(tid){const t=state.tracks.find(x=>x.id===tid);if(!t)return;const q=state.tracks.filter(x=>x.category===t.category);setCurrent(t,q.length?q:[t]);};
moveQueue=function(direction){
  if(!currentQueue?.length)return toast("Search for music or add a song first.");
  if(repeat&&direction===1&&queueIndex===currentQueue.length-1){if(ytPlayer){ytPlayer.seekTo(0,true);ytPlayer.playVideo();}return;}
  if(shuffle&&direction===1&&currentQueue.length>1){let n=queueIndex;while(n===queueIndex)n=Math.floor(Math.random()*currentQueue.length);queueIndex=n;}
  else queueIndex=(queueIndex+direction+currentQueue.length)%currentQueue.length;
  if(currentQueue[queueIndex])setCurrent(currentQueue[queueIndex],currentQueue);
};
togglePlayback=function(){
  if(ytPlayer){if(ytPlayer.getPlayerState()===YT.PlayerState.PLAYING){ytPlayer.pauseVideo();$("#playPauseBtn").textContent="▶";}else{ytPlayer.playVideo();$("#playPauseBtn").textContent="Ⅱ";}}
  else if(currentId){$("#activeEmbed")?.scrollIntoView({behavior:"smooth"});toast("Use Spotify's player controls for this track.");}
  else openModal();
};
searchCategory=function(category){
  const words={English:"English pop hits",Pakistani:"Pakistani songs Coke Studio",Bollywood:"Bollywood Hindi songs"};
  $("#musicGenre").value=category;$("#musicQuery").value=words[category]||category+" music";
  $("#musicSearchSection").scrollIntoView({behavior:"smooth"});runMusicSearch("");
};
$("#playPauseBtn").onclick=togglePlayback;
$("#searchStatus").textContent="Search YouTube music and play it here. No API key entry is required.";
