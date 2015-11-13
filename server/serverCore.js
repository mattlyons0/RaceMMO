'use strict';
/**
 * Server functions specifically for serverSide only
 */

require('../shared/gameCore');

var debug = require('debug')('RaceMMO:ServerCore');
var diff = require('deep-diff').diff; //For diffing objects
var hash = require('object-hash'); //For hashing objects
var deepcopy = require('deepcopy'); //For copying objects

/**
 * Create player instance for server logic
 * @param player instance of player
 */
GameCore.prototype.serverCreateNewPlayer = function (player) {
  this.players[player.userID] = new GamePlayer(this, player);
  var playerObj = this.players[player.userID];
  playerObj.physicsState.pos =
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
 * Notify clients of changes to player states
 */
GameCore.prototype.serverUpdate = function () {
  this.serverTime = this.localTime; //Update our clock to match timer
  //if (this.lastState.his === this.players.self.lastInputSeq && this.lastState.cis === this.players.other.lastInputSeq) {
  //  return; //Disables sending same state multiple times, but also causes state match bugs, so I'll comment it until its needed
  //}
  //TODO send unique hash with each serverupdate so we don't have to iterate through every player to check if a update has changed or not

  //Collect update into snapshot update
  var playersData = [];
  var num = 0;
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      var player = this.players[key];
      playersData[num] = {id: key, pos: player.physicsState.pos, is: player.physicsState.lastInputSeq};
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
 * Updated every 15ms, simulates world state
 */
GameCore.prototype.serverUpdatePhysics = function () {
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      var player = this.players[key];
      player.physicsState.oldPos = GameCore.mathUtils.pos(player.physicsState.pos); //Move current state to oldState
      var newDir = this.processInput(player.physicsState);
      player.physicsState.pos = GameCore.mathUtils.vAdd(player.physicsState.oldPos, newDir);
      player.physicsState.inputs = []; //Remove input queue because they were processed
    }
  }
  //Separate loops because we want collision check to happen after movement
  //Do Collision
  for (var key1 in this.players) {
    if (this.players.hasOwnProperty(key1)) {
      var player1 = this.players[key1];
      this.checkCollision(player1);
    }
  }
};
/**
 * Check what has changed in the state and respond accordingly
 */
GameCore.prototype.updateState = function () {
  var keysChanged = [];
  //Determine which players changed and assign new hash
  for (let key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      var player = this.players[key];
      var stateHash = hash.sha1(player.state); //TODO check how long this takes
      if (player.oldState.hash !== stateHash) { //This players state has changed
        keysChanged.push(key);
        player.oldState.hash = stateHash;
      }
    }
  }
  //Determine what changed and handle changes
  for (var x = 0; x < keysChanged.length; x++) {
    var playerChanged = this.players[keysChanged[x]];
    var changes = diff(playerChanged.oldState.state, playerChanged.state); //TODO check how long this takes

    //Handle Changes
    for (var index = 0; index < changes.length; index++) {
      var change = changes[index];
      switch (change.path[0]) {
        case 'color':
          for (let key in this.players) { //Send all clients that a client changed color
            if (this.players.hasOwnProperty(key) && key != keysChanged[x]) {
              this.players[key].instance.send('s.pl.c.' + change.rhs + '.' + keysChanged[x]); //Send which client changed to which color
            }
          }
          break;

        default:
          console.warn('Unhandled change at ' + change.path[0]);
      }
    }
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
 * Send a packet with the states of all the other players in the server (except self)
 * @param player the player object to send states to
 */
GameCore.prototype.dumpStateToClient = function (player) {
  var totalState = []; //Total state is an array, each index has {id,state} (the player id and its full state respectively)
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key) && key !== player.userID) {
      totalState.push({
        id: key,
        state: this.players[key].state
      });
    }
  }
  this.players[player.userID].instance.emit('onstatedump', totalState);
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
  playerClient.physicsState.inputs.push({inputs: input, time: inputTime, seq: inputSeq}); //Push into array of stored inputs
};
/**
 * For the server, cancel the setTimeout
 */
GameCore.prototype.stopUpdate = function () {
  window.cancelAnimationFrame(this.updateID);
};
