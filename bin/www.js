'use strict';

/**
 * Module dependencies.
 */

var app = require('../app');
var debug = require('debug')('RaceMMO:server');
var http = require('http');
var io = require('socket.io');
var uuid = require('node-uuid');
var charm = require('charm')();

var commands = [];
var endCommand;
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
      if (!endCommand) {
        runCommand(chunk);
      } else {
        endCommand();
        endCommand = undefined;
        if (process.stdin.isTTY)
          process.stdin.setRawMode(false);
      }
    }
  });

  process.stdin.on('end', function () {
    debug('Stdin has ended');
  });

  charm.pipe(process.stdout);

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
    var displayMode = args[0];
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
  addCommand('load', 'Display percent time used by each timer in each lobby. Can take argument of display mode: Inline (Default, updates itself), Full (Clears screen), WebStorm (Omits Header)', function (args) {
    var loadTimers = [], deltas, physics, logics;

    var lastNumGames = 0;
    var displayMode; //full (clears every update), inline (updates only itself), webstorm (doesn't update header)
    if (args[0]) {
      displayMode = (args[0] + '').toLowerCase();
    } else if (process.env.DEBUG_COLORS) { //Thats how we detect webstorm for now
      displayMode = 'webstorm';
    } else {
      displayMode = 'inline';
    }
    var logInterval;
    if (process.stdin.isTTY)
      process.stdin.setRawMode(true);
    endCommand = function () {
      clearInterval(logInterval);
      stopPopulation();
      console.log('\nExited Load Manager');
    };

    populateData();

    //Log Data
    logInterval = setInterval(function () {
      var count1 = 0;
      for (var gameID1 in gameServer.games) { //Check if games list has changed since last update
        if (gameServer.games.hasOwnProperty(gameID1)) {
          count1++;
          var found = false;
          for (var gameID2 in deltas) {
            if (deltas.hasOwnProperty(gameID2)) {
              if (gameID2 === gameID1) {
                found = true;
                break;
              }
            }
          }
          if (found === false) {
            populateData(); //Game list has updated!
            return;
          }
        }
      }
      var count2 = 0;
      for (var gameID in deltas) {
        if (deltas.hasOwnProperty(gameID)) {
          count2++;
        }
      }
      if (count1 !== count2) {
        populateData(); //Game list has a game that no longer exists
        return;
      }
      //Write to console
      if (displayMode === 'inline') {
        charm.up(lastNumGames + 1); //Overwrite last log
        charm.erase('down');
      } else if (displayMode === 'full') {
        charm.reset(); //Clear the terminal
      }
      if (displayMode !== 'webstorm') {
        process.stdout.write('Game ID                              LogicDelta\tPhysicsDelta\tDelta\n');
      }
      if (count2 === 0) {
        charm.display('bright');
        process.stdout.write('No Active Lobbies\n');
        charm.display('reset');
        lastNumGames = 1;
      } else {
        lastNumGames = gameServer.gameCount;
      }
      for (var gameID in deltas) {
        if (deltas.hasOwnProperty(gameID)) {
          //Calculate Averages
          var logic = 0;
          var physic = 0;
          var delta = 0;
          for (var x = 0; x < logics[gameID].length; x++) {
            logic += logics[gameID][x];
          }
          logic /= logics[gameID].length; //Avg time in ms
          logic /= GameCore.frameTime / 100;  //Percent time used (of total time given)

          for (var x = 0; x < physics[gameID].length; x++) {
            physic += physics[gameID][x];
          }
          physic /= physics[gameID].length; //Avg time in ms
          physic /= GameCore.PHYSICS_UPDATE_TIME / 100; //Percent time used (of total time given)
          for (var x = 0; x < deltas[gameID].length; x++) {
            delta += deltas[gameID][x];
          }
          delta /= deltas[gameID].length; //Avg time in ms
          delta /= GameCore.DELTA_UPDATE_TIME / 100;  //Percent time used (of total time given)

          process.stdout.write(gameID + ' ');
          charm.foreground(heatColor(logic));
          process.stdout.write(logic.fixed(2) + '%\t');
          charm.foreground(heatColor(physic));
          process.stdout.write(physic.fixed(2) + '%\t\t');
          charm.foreground(heatColor(delta));
          process.stdout.write(delta.fixed(2) + '%\n');
          charm.foreground('black');
        }
      }
    }, 1000); //Log every 1000 seconds


    function populateData() {
      stopPopulation();

      deltas = [];
      physics = [];
      logics = [];

      for (var gameID in gameServer.games) {
        if (gameServer.games.hasOwnProperty(gameID)) {
          setupPopulateLoop(gameID, deltas, GameCore.DELTA_UPDATE_TIME);
          setupPopulateLoop(gameID, physics, GameCore.PHYSICS_UPDATE_TIME);
          setupPopulateLoop(gameID, logics, GameCore.frameTime);
        }
      }
    }

    function setupPopulateLoop(id, timer, updateTime) {
      var core = gameServer.games[id].GameCore;
      //Delta Timer
      if (!timer[id]) {
        timer[id] = [];
      }
      loadTimers.push(setInterval(function () {
        if (!timer[id]) {
          return;
        }
        timer[id].push(core._dt);
        if (timer[id].length > (1000 / updateTime)) { //If we stored more than one second of history
          timer[id].splice(0, 1); //Remove Oldest
        }
      }, updateTime)); //Record Delta History of the last second
    }

    function stopPopulation() {
      for (var x = 0; x < loadTimers.length; x++) {
        clearInterval(loadTimers[x]);
        delete loadTimers[x];
      }
    }

    function heatColor(percent) {
      var num = Number(percent);
      if (num < 50)
        return 'green';
      else if (num < 85)
        return 'yellow';
      else if (num < 99)
        return 35;
      else if (num < 150)
        return 'red';
      else
        return 'magenta';
    }
  });
  addCommand('fakelag', 'Display emulated latency, or set using the desired latency as the parameter.', function (args) {
    if (args[0]) { //First argument is latency in ms
      var latency = Number(args[0]);
      if (isNaN(latency)) {
        charm.foreground('red');
        console.log(args[0] + ' is not a number.');
        charm.foreground('black');
        return;
      }
      gameServer.fakeLag = latency;
      console.log('Emulating Latency of ' + latency + ' ms.');
    } else { //We need a game and a latency
      console.log('Emulating '+ gameServer.fakeLag + 'ms of latency.');
    }
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
  sio.set('heartbeat interval', 1000); //1 sec interval to check if clients are alive
  sio.set('heartbeat timeout', 5000); //5 sec timeout to drop dead clients if they are still dead

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
