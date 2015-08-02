#!/usr/bin/env node

/**
 * Module dependencies.
 */

var app = require('../app');
var debug = require('debug')('RaceMMO:server');
var http = require('http');
var io = require('socket.io');
var uuid = require('node-uuid');
/**
 * Get port from environment and store in Express.
 */

var port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

/**
 * Create HTTP server.
 */

var server = http.createServer(app);
app.server = server;

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/*
Setup Socket.io Server
 */
var sio = io(server);
app.sio = sio;
setupSocketIO(sio);

/*
Setup Game Server
 */

var gameServer = require('../server/gameServer');
app.gameServer = gameServer;
setupGameServer(gameServer);

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

    client.on('message', function (message) { //Forward messages to game server
      server.onMessage(client, message);
    });

    client.on('disconnect', function () { //Forward disconnects to Server
      debug(client.userID + ' disconnected');
      server.onDisconnect(client);
    });
  });
}
/**
 * Setup Socket.IO Listener
 */

function setupSocketIO(sio){
  sio.set('authorization', function (handshakeData, callback) {
    // make sure the handshake data looks good
    callback(null, true); // error first, 'authorized' boolean second
  });
}

/**
 * Normalize a port into a number, string, or false.
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
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

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
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
}
module.exports = app;