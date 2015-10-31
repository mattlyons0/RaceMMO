/*
 SERVER FUNCTIONS
 Functions specifically for serverSide only
 */

var GamePlayer = require('../shared/gamePlayer');
require('../shared/gameCore');

var diff = require('deep-diff').diff;
var hash = require('object-hash');
var deepcopy = require('deepcopy');

/**
 * Create player instance for server logic
 * @param player instance of player
 */
GameCore.prototype.serverCreateNewPlayer = function (player) {
  this.players[player.userID] = new GamePlayer(this, player);
  var playerObj = this.players[player.userID];
  playerObj.state.pos =
  { //Generate random starting positions for each player
    x: GameCore.mathUtils.randomInt(playerObj.state.posLimits.xMin, playerObj.state.posLimits.xMax),
    y: GameCore.mathUtils.randomInt(playerObj.state.posLimits.yMin, playerObj.state.posLimits.yMax)
  };
};
/**
 * Remove player instance from server logic
 * @param player instance of player
 */
GameCore.prototype.serverRemovePlayer = function (player) {
  delete this.players[player.userID];
};
/**
 * Updated every 15ms, simulates world state
 */
GameCore.prototype.serverUpdatePhysics = function () {
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      var player = this.players[key];
      player.oldState.pos = GameCore.mathUtils.pos(player.state.pos); //Move current state to oldState
      var newDir = this.processInput(player.state);
      player.state.pos = GameCore.mathUtils.vAdd(player.oldState.pos, newDir);
      player.state.inputs = []; //Remove input queue because they were processed
    }
  }
  //Seperate loops because we want collision check to happen after movement
  //Do Collision
  for (var key1 in this.players) {
    if (this.players.hasOwnProperty(key1)) {
      var player1 = this.players[key1];
      this.checkCollision(player1.state);
    }
  }
};
/**
 * Notify clients of changes to player states
 */
GameCore.prototype.serverUpdate = function () {
  this.serverTime = this.localTime; //Update our clock to match timer
  //if (this.lastState.his === this.players.self.lastInputSeq && this.lastState.cis === this.players.other.lastInputSeq) {
  //  return; //Disables sending same state multiple times, but also causes state match bugs, so I'll comment it until its needed
  //}
  //TODO send unique hash with each serverupdate so we don't have to iterate through every player to check if a update has changed or not
  var playersData = [];
  var num = 0;
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      var player = this.players[key];
      playersData[num] = {id: key, pos: player.state.pos, is: player.state.lastInputSeq};
      num++;
    }
  }
  this.lastState = { //Snapshot current state for updating clients
    pl: playersData,
    t: this.serverTime //Time local to server
  };

  //Send data updates to all clients
  for (var key1 in this.players) {
    if (this.players.hasOwnProperty(key1)) {
      var player1 = this.players[key1];
      player1.instance.emit('onserverupdate', this.lastState);
    }
  }

  this.updateState();
};

/**
 * Check what has changed in the state and respond accordingly
 */
GameCore.prototype.updateState = function () {
  var keysChanged = [];
  //Determine which players changed and assign new hash
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      var player = this.players[key];
      var stateHash = hash.sha1(player.state); //TODO check how long this takes
      if (player.oldState.hash !== stateHash) { //This players state has changed
        keysChanged.push(key);
        player.oldState.hash = stateHash;
      }
    }
  }
  if (keysChanged.length > 0)
    console.log(keysChanged.length + ' players state changed.');
  //Determine what changed and handle changes
  for (var x = 0; x < keysChanged.length; x++) {
    var playerChanged = this.players[keysChanged[x]];
    var changes = diff(playerChanged.oldState.state, playerChanged.state); //TODO check how long this takes

    //Handle Changes

    console.log(changes);
  }
  //Save state as old state
  for (var key1 in this.players) {
    if (this.players.hasOwnProperty(key1)) {
      var player1 = this.players[key1];

      player1.oldState.state = deepcopy(player1.state);  //Copy entire state (by memory, not reference)
    }
  }
};

/**
 * Ensure input gets put in the array properly
 * @param client client making the inputs
 * @param input input given
 * @param inputTime time input was given
 * @param inputSeq sequence of inputs
 */
GameCore.prototype.handleServerInput = function (client, input, inputTime, inputSeq) {
  var playerClient = this.players[client.userID];//Figure out which player gave the input
  playerClient.state.inputs.push({inputs: input, time: inputTime, seq: inputSeq}); //Push into array of stored inputs
};

/**
 * For the server, cancel the setTimeout
 */
GameCore.prototype.stopUpdate = function () {
  window.cancelAnimationFrame(this.updateID);
};
