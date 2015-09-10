//#!/usr/bin/env node

/**
 * Module dependencies.
 */

var app = require('../app');
var debug = require('debug')('RaceMMO:server');
var http = require('http');
var io = require('socket.io');
var uuid = require('node-uuid');

var commands = [];
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
setupCommandLine(gameServer);

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
 * Configure stdin to call runCommand() and sets up commands
 * @param gameServer server to apply commands to
 */
function setupCommandLine(gameServer) {
  process.stdin.setEncoding('utf8');

  process.stdin.on('readable', function () {
    var chunk = process.stdin.read();
    if (chunk !== null) {
      runCommand(chunk);
    }
  });

  process.stdin.on('end', function () {
    debug('Stdin has ended');
  });

  //Setup commands

  addCommand('help', 'Displays a list of all commands. If supplied a command will only show help for that command', function (args) {
    var output = '';
    for (var i = 0; i < commands.length; i++) {
      var command = commands[i];
      if ((args[0] === command.command) || !args[0]) //If we have a first argument, only show help for that. Otherwise show help for everything
        output += command.command + ': ' + command.description + '\n';
    }
    console.log(output);
  });
  addCommand('games', 'Display a list of ongoing games. If supplied a game number (from the list), will show extended details from that game.', function (args) {
    var games = gameServer.games;
    var num = 1;

    var output = 'Currently ' + gameServer.gameCount + ' game' + (gameServer.gameCount !== 1 ? 's' : '') + '.\n';
    for (var gameID in games) {
      if (games.hasOwnProperty(gameID)) {
        var game = games[gameID];
        if (!args[0] || args[0] == num) //If argument supplied only show that number, otherwise show all games
          output += '\t' + (!args[0] ? (num + ') ') : '') + game.id + ': (' + game.playerCount + '/' + game.playerCapacity + ')\n';
        if (args[0] == num) {
          var pcount = 1;
          output += '\tPlayers: \n';
          for (var player in game.players) {

            if (game.players.hasOwnProperty(player)) {
              output += '\t\t' + pcount + ') ' + game.players[player].userID;

              pcount++;
            }
          }
        }
        num++;
      }
    }
    console.log(output);
  });
}
/**
 * Handle stdin
 * @param msg command input
 */
function runCommand(msg) {
  msg = msg.trim();
  var args = msg.split(' ');
  if (args.length === 0)
    return;
  for (var i = 0; i < commands.length; i++) {
    var command = commands[i];
    if (args[0] === command.command) {
      command.callback(args.splice(1, args.length - 1)); //Give everything as an argument except command
      return;
    }
  }
  console.log('No command found.');
}
/**
 * Add command to respond to input
 * @param str string which will call the command
 * @param description description of what the command does to be used for help text
 * @param callback function to call when command is run (will be given arguments)
 */
function addCommand(str, description, callback) {
  commands.push({command: str, description: description, callback: callback});
}
/**
 * Setup Socket.IO Listener
 */

function setupSocketIO(sio) {
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
