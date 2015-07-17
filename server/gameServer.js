var gameServer = {games: {}, gameCount: 0, recentGame: undefined};

var uuid = require('node-uuid');
var debugLib = require('debug');
var debug=debugLib('RaceMMO:gameServer');
var error=debugLib('RaceMMO:gameServer:error');
require('../shared/gameCore'); //Import Game Core


global.window = global.document = global; //TODO figure out what this is

//Initialize Server Vars
gameServer.fakeLag = 0;
gameServer.localTime = 0;
gameServer._dt = new Date().getTime(); //DeltaTime
gameServer._dte = new Date().getTime(); //Delta Time Elapsed
gameServer.messages = []; //Queue messages for faking latency

/**
 * Handle Updating Timing
 */
setInterval(function () {
  gameServer._dt = new Date().getTime() - gameServer._dte; //Update Time
  gameServer._dte = new Date().getTime(); //Make new delta
  gameServer.localTime += gameServer._dt / 1000.0; //Milliseconds to seconds
}, 4); //Update time 250 times per second

/**
 * Handle Messages from clients
 * @param client client sending message
 * @param message message from client
 */
gameServer.onMessage=function(client,message) {
  if(this.fakeLag&&message.split('.')[0].substr(0,1)=='i') { //If we are faking latency and it is a input message
    //Store input messages to emulate lag
    gameServer.messages.push({client: client, message: message});

    setTimeout(function() { //Go through latency queue, delayed
      if(gameServer.messages.length) {
        gameServer._onMessage(gameServer.messages[0].client, gameServer.messages[0].message);
        gameServer.messages.splice(0, 1);
      }
    }.bind(this),this.fakeLag);
  }
  else {
    gameServer._onMessage(client, message); //Handle messages regularly
  }
};

/**
 * Parse messages as they come in
 * @param client client sending message
 * @param message message
 * @private called through onMessage after evaluating if there is fake latency
 */
gameServer._onMessage=function(client,message) {
  var messageParts = message.split('.');
  var messageType = messageParts[0];
  //Other client is either host or client
  var otherClient = (client.game.playerHost.userID == client.userID) ? client.game.playerClient : client.game.playerHost;

  //Parse Message Type
  switch (messageType) {
    case 'i': //Input
      this.onInput(client, messageParts);
      break;
    case 'p': //Ping TODO
      client.send('s.p.' + messageParts[1]);
      break;
    case 'c': //Color change
      if(otherClient)
        otherClient.send('s.c.' + messageParts[1]);
      break;
    case 'l': //Lag simulation request
      this.fakeLag = parseFloat(messageParts[1]); //Given in MS
      break;
  }
};

/**
 * Handle input from clients
 * @param client client sending input
 * @param parts arguments to input request
 */
gameServer.onInput=function(client,parts) {
  var commands = parts[1].split('-');
  var time = parts[2].replace('-', '.');
  var sequence = parts[3];

  //Tell game to handle input
  if(client&&client.game&&client.game.gameCore) {
    client.game.gameCore.handleServerInput(client, commands, time, sequence);
  }
};

/**
 * Create a new game
 * @param player host client
 */
gameServer.createGame=function(player) {
  var game = {
    id: uuid(),
    playerHost: player,
    playerClient: null,
    playerCount: 1,
    playerCapacity: 2
  };
  this.games[game.id]=game; //Store game
  this.games.recentGame = game;
  this.gameCount++;

  //Create core instance for this game
  game.gameCore = new gameCore(game);
  game.gameCore.update(new Date().getTime()); //Start game loop

  //Tell client they are host s=server message h=you are host
  player.send('s.h.' + String(game.gameCore.localTime).replace('.', '-'));
  debug('Server host at ' + game.gameCore.localTime);
  player.game = game;
  player.hosting = true;
  debug('player: ' + player.userID + ' created game with id ' + player.game.id);

  return game;
};

/**
 * Request to kill game
 * @param gameID game to kill
 * @param userID user requesting kill
 */
gameServer.endGame=function(gameID,userID) {
  var game = this.games[gameID];
  if(game) {
    game.gameCore.stopUpdate(); //Stop game updates
    if(game.playerCount>1) { //If there are 2 players, one is leaving
      if(userID==game.playerHost.userID) { //If the host left tell the other client the game is over
        if(game.playerClient) {
          game.playerClient.send('s.e'); //Notify client game has ended
          this.findGame(game.playerClient); //Look for/make a new game for that player
        }
      }
      else { //We are host and the only player
        if(game.playerHost) { //Tell the client the game is over
          game.playerHost.send('s.e'); //Tell them this game is ending
          game.playerHost.hosting = false; //No longer host since game is over
          this.findGame(game.playerHost); //Find them a new game
        }
      }
    }
    delete this.games[gameID]; //Remove this game from the list of games
    this.gameCount--;
    debug('Game ended. Currently ' + this.gameCount + ' games.');
  }
  else{
    error('Client: ' + userID + ' tried ending Game: ' + gameID + ' that does not exist!');
  }
};

/**
 * A game has been created and has 2 players, thus this is called
 * @param game game to start
 */
gameServer.startGame=function(game) {
  game.playerClient.send('s.j.' + game.playerHost.userID); //tell client he is joining a game hosted by someone
  game.playerClient.game = game;

  game.playerClient.send('s.r.' + String(game.gameCore.localTime).replace('.', '-')); //reset positions of both players
  game.playerHost.send('s.r.' + String(game.gameCore.localTime).replace('.', '-'));

  game.active=true;
};

/**
 * Find a game for given player
 * @param player player to find a slot for
 */
gameServer.findGame=function(player) {
  debug('Looking for game. Currently: ' + this.gameCount);

  if(this.gameCount) { //There are active games
    var found = false;
    for(var gameID in this.games) { //Check for game with slots
      if(!this.games.hasOwnProperty(gameID)) continue; //TODO
      var instance = this.games[gameID];
      if(instance.playerCount<instance.playerCapacity) {
        found = true;
        instance.playerClient = player;
        instance.gameCore.players.other.instance = player;
        instance.playerCount++;

        this.startGame(instance);
      }
    }
    if(!found) {
      this.createGame(player); //No games with slots
    }
  }
  else{
    this.createGame(player); //No games currently
  }
};


module.exports = gameServer;