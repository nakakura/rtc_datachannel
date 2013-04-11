
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , WebSocketServer = require('ws').Server


var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.get('/', routes.index);
app.get('/users', user.list);

var httpServer = http.createServer(app);

var wss = new WebSocketServer({server:httpServer});
var rooms = {};
// "123" : {"peers": [ ws0, ws1], "lastUpdated": new Date().getTime();}

wss.on('connection', function(ws) {
    var room_no = ws.upgradeReq.url.slice(1);
    console.log("connected new client");
    if(!!rooms[room_no] === false) {
      rooms[room_no] = {"peers": [ws], "lastUpdated": new Date().getTime()}
    } else if(rooms[room_no].peers.length < 2) {
      rooms[room_no]["peers"].push(ws);
      rooms[room_no]["lastUpdated"] = new Date().getTime();
    } else {
      console.log("room is full!!");
      ws.close();
    }

    ws.on('message', function(data) {
      rooms[room_no].peers.forEach(function(cli){
        if(ws !== cli) {
          // prevent echo
          cli.send(data);
        }
      });

      rooms[room_no].lastUpdated = new Date().getTime();
    });

    ws.on('close', function(ev){
      var idx = rooms[room_no].peers.indexOf(ws);
      console.log("connection terminated for %d", idx);

      if(idx !== -1) {
        rooms[room_no].peers.splice(idx, 1);
      }
      rooms[room_no].lastUpdated = new Date().getTime();
    });
});

httpServer.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
