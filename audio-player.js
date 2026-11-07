/* MUSICVERSE audio mode.
   Free, legal music from Audius, played through a real <audio> element so it keeps
   playing with the screen locked, with lock-screen / headset controls (Media Session).
   Loaded after app.js and shared-search.js; YouTube mode is left untouched. */
(function(){
  const API="https://api.audius.co/v1", APP="MUSICVERSE";
  const audio=new Audio();
  audio.preload="auto";
  audio.setAttribute("playsinline","");
  audio.id="mvAudio";
  document.body.appendChild(audio);

  const ms="mediaSession" in navigator?navigator.mediaSession:null;
  let errStreak=0;

  const ytSearch=runMusicSearch, ytSetCurrent=setCurrent, ytToggle=togglePlayback,
        ytMove=moveQueue, ytRender=renderMusicResults, ytQueue=makeSearchQueue;

  const status=t=>{$("#searchStatus").textContent=t;};
  const curTrack=()=>state.tracks.find(t=>t.id===currentId);
  const audioActive=()=>!!audio.getAttribute("src")&&!!curTrack()&&curTrack().provider==="audius";
  const fmt=s=>{if(!isFinite(s))return"0:00";s=Math.floor(s);return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");};

  /* ---- source switch next to the category dropdown ---- */
  const src=document.createElement("select");
  src.id="musicSource";
  src.setAttribute("aria-label","Music source");
  src.innerHTML='<option value="audius">Free music · background play</option><option value="youtube">YouTube · video</option>';
  $("#musicGenre").after(src);
  status("Search free music (Audius). It plays as audio only and keeps going with the screen locked.");

  /* ---- track + search ---- */
  function auTrack(t){
    const art=t.artwork||{};
    const genre=$("#musicGenre").value;
    return {
      id:"au-"+t.id, provider:"audius",
      audioUrl:API+"/tracks/"+encodeURIComponent(t.id)+"/stream?app_name="+APP,
      title:t.title, artist:(t.user&&t.user.name)||"Audius",
      url:t.permalink?"https://audius.co"+t.permalink:"https://audius.co",
      artwork:art["480x480"]||art["150x150"]||art["1000x1000"]||"",
      duration:t.duration||0,
      category:genre==="All"?"Other":genre, playlistId:"", addedAt:Date.now()
    };
  }

  runMusicSearch=async function(pageToken){
    if($("#musicSource").value!=="audius")return ytSearch(pageToken);
    const query=$("#musicQuery").value.trim();
    if(query.length<2){status("Enter at least two characters to search.");return;}
    const offset=pageToken?(parseInt(pageToken,10)||0):0;
    if(!pageToken){searchResults=[];searchNextPageToken="";$("#musicResults").innerHTML="";status("Searching free music…");}
    $("#moreResults").hidden=true;
    try{
      const r=await fetch(API+"/tracks/search?"+new URLSearchParams({query,limit:"20",offset:String(offset),app_name:APP}));
      if(!r.ok)throw new Error("HTTP "+r.status);
      const j=await r.json();
      const raw=Array.isArray(j.data)?j.data:[];
      const items=raw.filter(t=>t&&t.id&&t.title&&t.is_streamable!==false&&!(t.access&&t.access.stream===false)).map(auTrack);
      searchResults=pageToken?searchResults.concat(items):items;
      searchNextPageToken=raw.length>=20?String(offset+20):"";
      renderMusicResults();
      status(searchResults.length
        ?"Showing "+searchResults.length+" free tracks for “"+query+"”. Tap play to listen. Music by independent artists on Audius."
        :"No free tracks found. Audius has mostly independent artists, so try another name, or switch to YouTube.");
      $("#moreResults").hidden=!searchNextPageToken;
    }catch(e){
      status("Could not reach the free music service. Check your connection and try again.");
    }
  };

  renderMusicResults=function(){
    if(!(searchResults.length&&searchResults[0].provider==="audius"))return ytRender();
    $("#musicResults").innerHTML=searchResults.map((t,i)=>{
      const thumb=t.artwork?'<img class="music-result-thumb" src="'+safeText(t.artwork)+'" alt="" loading="lazy">':'<div class="music-result-thumb"></div>';
      return '<article class="music-result">'+thumb+'<div class="music-result-body"><div class="music-result-title">'+safeText(t.title)+'</div><div class="music-result-channel">'+safeText(t.artist)+'</div><div class="music-result-actions"><button class="primary-btn" type="button" data-play-search="'+i+'">▶ Play</button><button class="small-action" type="button" data-queue-search="'+i+'" title="Add to library">＋</button></div></div></article>';
    }).join("");
  };

  makeSearchQueue=function(){
    return searchResults.map(r=>r.provider==="audius"?r:youtubeTrackFromResult(r));
  };

  /* ---- playback ---- */
  function stopAudio(){
    if(!audio.getAttribute("src"))return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  setCurrent=function(track,queue){
    if(!track)return;
    if(track.provider!=="audius"){
      stopAudio();
      $("#nowArt").style.backgroundImage="";
      return ytSetCurrent(track,queue);
    }
    if(ytPlayer){try{ytPlayer.destroy();}catch(e){}ytPlayer=null;}
    if(!state.tracks.some(t=>t.id===track.id))state.tracks.unshift(track);
    currentId=track.id;
    currentQueue=queue&&queue.length?queue:[track];
    queueIndex=currentQueue.findIndex(t=>t.id===track.id);
    state.recent=[track.id,...state.recent.filter(x=>x!==track.id)].slice(0,20);
    localStorage.setItem(STORE,JSON.stringify(state));
    renderAll();
    $("#nowTitle").textContent=track.title;
    $("#nowArtist").textContent=track.artist;
    const art=$("#nowArt");
    if(track.artwork){art.textContent="";art.style.backgroundImage='url("'+track.artwork+'")';art.style.backgroundSize="cover";art.style.backgroundPosition="center";}
    else{art.style.backgroundImage="";art.textContent="♫";}
    $("#playerHint").textContent="Now playing · "+track.artist+" · via Audius";
    showAudioPanel(track);
    errStreak=0;
    audio.src=track.audioUrl;
    const p=audio.play();
    if(p&&p.catch)p.catch(()=>toast("Tap play to start."));
    setMediaSession(track);
  };

  function showAudioPanel(track){
    let panel=$("#activeEmbed");
    if(!panel){panel=document.createElement("section");panel.id="activeEmbed";panel.className="content-section embed-panel";$("#recentSection").after(panel);}
    panel.classList.remove("youtube");
    const art=track.artwork?'<img class="audio-art" src="'+safeText(track.artwork)+'" alt="">':'<div class="audio-art">♫</div>';
    panel.innerHTML='<div class="section-heading"><div><div class="eyebrow muted">NOW PLAYING · AUDIO</div><h2>'+safeText(track.title)+'</h2></div><button class="text-link" id="closeEmbed">CLOSE ×</button></div><div class="audio-card">'+art+'<div class="audio-body"><p class="embed-title">'+safeText(track.artist)+' · via Audius</p><input id="audioSeek" class="audio-seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="Seek"><div class="audio-times"><span id="audioCur">0:00</span><span id="audioDur">0:00</span></div></div></div>';
    $("#closeEmbed").onclick=()=>{stopAudio();panel.remove();$("#playPauseBtn").textContent="▶";};
    $("#audioSeek").addEventListener("input",e=>{
      if(isFinite(audio.duration)&&audio.duration>0)audio.currentTime=audio.duration*(parseFloat(e.target.value)/100);
    });
    panel.scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function updateProgress(){
    const seek=$("#audioSeek");
    if(!seek)return;
    const d=audio.duration;
    if(isFinite(d)&&d>0){
      if(document.activeElement!==seek)seek.value=String((audio.currentTime/d)*100);
      $("#audioCur").textContent=fmt(audio.currentTime);
      $("#audioDur").textContent=fmt(d);
      if(ms&&ms.setPositionState){
        try{ms.setPositionState({duration:d,playbackRate:audio.playbackRate||1,position:Math.min(audio.currentTime,d)});}catch(e){}
      }
    }
  }

  audio.addEventListener("timeupdate",updateProgress);
  audio.addEventListener("loadedmetadata",updateProgress);
  audio.addEventListener("playing",()=>{errStreak=0;});
  audio.addEventListener("play",()=>{$("#playPauseBtn").textContent="Ⅱ";if(ms)ms.playbackState="playing";});
  audio.addEventListener("pause",()=>{if(audio.getAttribute("src")){$("#playPauseBtn").textContent="▶";if(ms)ms.playbackState="paused";}});
  audio.addEventListener("ended",()=>{
    if(repeat){audio.currentTime=0;audio.play().catch(()=>{});}
    else moveQueue(1);
  });
  audio.addEventListener("error",()=>{
    if(!audio.getAttribute("src"))return;
    errStreak++;
    if(errStreak>=3||currentQueue.length<2){toast("This track can't be played right now.");return;}
    toast("Track unavailable, skipping…");
    setTimeout(()=>moveQueue(1),700);
  });

  moveQueue=function(dir){
    if(audioActive()&&repeat&&dir===1&&queueIndex===currentQueue.length-1){
      audio.currentTime=0;audio.play().catch(()=>{});return;
    }
    return ytMove(dir);
  };

  togglePlayback=function(){
    if(audioActive()){
      if(audio.paused){audio.play().catch(()=>{});}else{audio.pause();}
    }else ytToggle();
  };
  $("#playPauseBtn").onclick=()=>togglePlayback();

  /* ---- lock screen / headset / notification controls ---- */
  function setMediaSession(track){
    if(!ms)return;
    try{
      ms.metadata=new MediaMetadata({
        title:track.title,artist:track.artist,album:"MUSICVERSE",
        artwork:track.artwork?[{src:track.artwork,sizes:"480x480",type:"image/jpeg"}]:[]
      });
    }catch(e){}
  }
  function handler(action,fn){try{ms.setActionHandler(action,fn);}catch(e){}}
  if(ms){
    handler("play",()=>{if(audioActive())audio.play().catch(()=>{});else if(ytPlayer&&ytPlayer.playVideo)ytPlayer.playVideo();});
    handler("pause",()=>{if(audioActive())audio.pause();else if(ytPlayer&&ytPlayer.pauseVideo)ytPlayer.pauseVideo();});
    handler("previoustrack",()=>moveQueue(-1));
    handler("nexttrack",()=>moveQueue(1));
    handler("seekto",d=>{if(audioActive()&&typeof d.seekTime==="number")audio.currentTime=d.seekTime;});
    handler("seekbackward",()=>{if(audioActive())audio.currentTime=Math.max(0,audio.currentTime-10);});
    handler("seekforward",()=>{if(audioActive())audio.currentTime=Math.min(audio.duration||Infinity,audio.currentTime+10);});
  }
})();
