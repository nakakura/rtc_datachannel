// obtaining room id from url
/////////////////////////////////////////////////////////////
var room_no;
(function(){
  var url = location.protocol + '//' + location.host + location.pathname + location.search;
  $("#room-url").html("<a href='"+url+"' target='_blank'>"+url+"</a>");

  var queries = location.search.slice(1).split("&");
  queries.forEach(function(query) {
    if(query.indexOf("r=") === 0) {
      room_no = query.slice(2);
    }
  });
}());

// utility function
///////////////////////////////////////////////////////////////
function trace(text) {
  // This function is used for logging.
  if (text[text.length - 1] == '\n') {
    text = text.substring(0, text.length - 1);
  }
  console.log((performance.now() / 1000).toFixed(3) + ": " + text);
}



// event handlers for User Interface
//////////////////////////////////////////////////////
$("#send form#text").submit(function(e) {
  e.preventDefault();
  var mesg = $(this).find("input[type=text]").val();
  if(!!mesg === false) return;
  $(this).find("input[name=mesg]").val("");

  var obj = {"seq": 0, "max": 0, "data": mesg}

  dataChannel.send(JSON.stringify(obj));
});

$("#send form#file input[name=file]").change(function(e){
  var file = e.target.files[0];
  var reader = new FileReader();
  reader.onload  = function(e){
    var data = e.target.result;
    var len = data.length;
    var plen = 300;
    var buff = [];

    for( var i = 0, l = Math.ceil(len / plen); i < l; i += 1) {
      var data_ = data.slice(plen * i, plen * (i + 1));
      var obj = {"seq": i, "max": l - 1, "data": data_};
      buff.push(obj);
    }

    var i = 0, l = Math.ceil(len / plen);
    var timer = setInterval(function(e) {
      console.log(i);
      if(i === l) {
        clearInterval(timer);
        return;
      } else {
        dataChannel.send(JSON.stringify(buff[i]));
        i += 1;
      }
    }, 150);
  }
  reader.readAsDataURL(file);
});

$("#send form#file").submit(function(e) {
  e.preventDefault();
});

outputToReceive = function(data) {
  if(data.indexOf("data:image") === 0) {
    $("#receive").prepend("<img src='"+data+"'><hr>");
  } else {
    $("#receive").prepend(data + "<hr>");
  }
}

$("#send button").attr("disabled", "disabled");
$("#send-offer").attr("disabled", "disabled");

$("#start").click(createConnection);
$("#send-offer").click(startSendOffer);

// establish signalling channel via WebSocket
/////////////////////////////////////////////////////////////////
var ws = new WebSocket('ws://'+location.host+"/"+room_no);

ws.onopen = function(e) {
  console.dir(ws);
  var self = this;
  this.isActive = true;
};

ws.onmessage = function(e) {
  var mesg = JSON.parse(e.data);

  if(!!mesg.type && typeof(signalling[mesg.type]) === "function") {
    signalling[mesg.type](mesg);
  } else {
  }
}

ws.onclose = function(e) {
  this.isActive = false;
}

function sendDescription(desc) {
  if(ws.isActive) {
    ws.send(JSON.stringify(desc));
    console.log(desc);
  }
}

var signalling = {
  'offer': onReceiveOffer,
  'answer': onReceiveAnswer,
  'candidate': onReceiveCandidate,
  'bye': onReceiveHangup
}
// WebRTC
/////////////////////////////////////////
var dataChannel,
  localVideo = document.getElementById('local'),
  remoteVideo = document.getElementById('remote'),
  localStream,
  remoteStream;


//
// callback functions for UserInterfaces

// When start btn clicked
function createConnection() {
  var servers = {
    iceServers: [
      { url: "stun:stun.l.google.com:19302"}
    ]
  };
  var options = {
    optional: [
      { RtpDataChannels: true } // use data channel
    ]
  };
  // If you use STUN, indicate stun url except for null
  window.pc = new webkitRTCPeerConnection(servers, options);
  trace('Created local peer connection object pc');

  // Start capturing video and audio
  navigator.webkitGetUserMedia({video: true, audio:true}, function(stream){
    localStream = stream;
    localVideo.src = webkitURL.createObjectURL(stream);
    localVideo.play();
    pc.addStream(localStream);
  });


  // data channel
  try {
    // Reliable Data Channels not yet supported in Chrome
    // Data Channel api supported from Chrome M25.
    // You need to start chrome with  --enable-data-channels flag.
    dataChannel = pc.createDataChannel("DataChannel",{reliable: false});
    //     {reliable: true});
    trace('Created send data channel');
  } catch (e) {
    alert('Failed to create data channel. ' +
        'You need Chrome M25 or later with --enable-data-channels flag');
    trace('Create Data channel failed with exception: ' + e.message);
  }

  // callback definitions for peer-peer
  pc.onicecandidate = iceCandidateCallback;
  pc.onaddstream = addStreamCallback;
  pc.onnegotiationneeded = negotiationNeededCallback;

  // callback definitions for datachannel
  dataChannel.onopen = onDataChannelStateChange;
  dataChannel.onmessage = onDataChannelReceiveMessage;
  dataChannel.onclose = onDataChannelStateChange;


  $("#start").attr("disabled", "disabled");
  $("#send-offer").attr("disabled", false);
}

// when send offer btn clicked.
function startSendOffer(){
  pc.createOffer(function(description){
    trace("create Offer succeed. Send it to peer.");
    pc.setLocalDescription(description);
    sendDescription(description);
  });
}

//
// callback functions for peer-connection api
//

// When ICE candidate info is received, send remote peer
// via Signalling channel
function iceCandidateCallback(event) {
  if (event.candidate) {
    trace("Found candidate. Send it to peer.");
    sendDescription({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    trace("End of candidate");
  }
}


// When receive remote stream, make it visible
function addStreamCallback(event) {
  remoteVideo.src = webkitURL.createObjectURL(event.stream);
  remoteVideo.play();
};

// When negotiationneeded event fired.
function negotiationNeededCallback(event) {
  console.log("fired negotiationneeded event");
}

//
// callback functions for arriving message from signalling channel
//

function onReceiveOffer(desc) {
  pc.addStream(localStream);
  pc.setRemoteDescription(new RTCSessionDescription(desc), function(){
      trace("Receive Offer from peer.");
      pc.createAnswer(function(description){
        trace("Create Answer succeeded. Send it to peer.");
        pc.setLocalDescription(description);
        sendDescription(description);
      });
  });
}

function onReceiveAnswer(desc){
  trace("Receive Answer from peer.");
  pc.setRemoteDescription(new RTCSessionDescription(desc));
}

function onReceiveCandidate(desc){
  trace("Receive Candidate from peer.");
  var candidate = new RTCIceCandidate({sdpMLineIndex:desc.label, candidate:desc.candidate});
  pc.addIceCandidate(candidate);
}

function onReceiveHangup(desc){
  trace("Receive Hangup from peer.");
  pc.close();
  pc = null;
}




function onDataChannelStateChange() {
  var readyState = dataChannel.readyState;
  if(readyState === "open"){
    $("#send-offer").attr("disabled", "disabled");
    $("#send button").attr("disabled", false);
  }
  trace('Send channel state is: ' + readyState);
}

var recvBuff = [];
function onDataChannelReceiveMessage(ev){
  console.log(ev);
  var data = JSON.parse(ev.data);
  recvBuff[data.seq] = data.data

  if(data.seq === data.max)
    outputToReceive(recvBuff.join(""));

  recvBuff.length = 0;
}
