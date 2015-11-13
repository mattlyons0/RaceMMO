'use strict';
/**
 * Startup servers
 *  Webserver using Express
 *  Socket.io Server
 *  GameServer
 *  Terminal Commands
 */

var app = require('../app');
var debug = require('debug')('RaceMMO:server');
var http = require('http');
var io = require('socket.io');
var uuid = require('uuid');
var commandLine = require('../server/commandLine');

//Set express port
var port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

//Create HTTP server
var server = http.createServer(app);
app.server = server;
//Listen on server
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

//SocketIO setup
var sio = io(server);
app.sio = sio;
setupSocketIO(sio);

//GameServer setup
var gameServer = require('../server/gameServer');
app.gameServer = gameServer;
setupGameServer(gameServer);

//CommandLine setup
commandLine.setupCommandLine(gameServer);


/**
 * Setup Socket.IO Listener
 */

function setupSocketIO(sio) { //TODO note, these timeouts may need to be altered
  sio.set('heartbeat interval', 1000); //1 sec interval to check if clients are alive
  sio.set('heartbeat timeout', 5000); //5 sec timeout to drop dead clients if they are still dead
}

/**
 * Setup Gameserver with the webserver and socket.io
 * @param server gameserver instance to setup
 */
function setupGameServer(server) {
  sio.sockets.on('connection', function (client) {
    client.userID = uuid(); //Generates UUID
    client.emit('onconnected', {id: client.userID}); //Tell player they are connected and give ID
    debug(client.userID + ' connected');

    //Connect them to a game lobby
    server.findGame(client);

    //Forward messages and disconnection to gameServer handler
    client.on('message', function (message) {
      server.onMessage(client, message);
    });
    client.on('disconnect', function () {
      debug(client.userID + ' disconnected');
      server.onDisconnect(client);
    });
  });
}

/**
 * Normalize a port into a number, string, or false.
 * @param {number} val value to normalize
 * @return {string|number|boolean} value if it isn't a number, integer if its a valid port and false if not.
 */
function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 * HTTP Errors
 */
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
  debug('Listening on ' + bind);
}

module.exports = app;
