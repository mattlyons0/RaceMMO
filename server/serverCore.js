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

  //Determine which players have changed since the last serverUpdate
  const changedIDs = [];

  for (const id in this.players) {
    if (this.players.hasOwnProperty(id)) {
      if (this.oldInputSeq[id] !== this.players[id].physicsState.lastInputSeq) {
        changedIDs.push(id);
        this.oldInputSeq[id] = this.players[id].physicsState.lastInputSeq;
      }
    }
  }

  this.lastState = this.generateServerUpdate(changedIDs);

  debug(this.lastState);
  //Send data updates to all clients
  for (const key in this.players) {
    if (this.players.hasOwnProperty(key)) {
      const player = this.players[key];
      player.instance.emit('onserverupdate', this.lastState);
    }
  }
  this.updateState();
};
/**
 * Generate update object
 * @param playerIDs array of IDs of players to include in update
 * @returns {{pl: Array, t: (number|*)}} Object to send client as serverupdate
 */
GameCore.prototype.generateServerUpdate = function (playerIDs) {
  //Collect update into snapshot update
  const playersData = [];
  for (let index = 0; index < playerIDs.length; index++) {
    const player = this.players[playerIDs[index]];
    playersData[index] = {
      id: playerIDs[index],
      pos: player.physicsState.pos,
      is: player.physicsState.lastInputSeq
    };
  }
  return { //Snapshot current state for given IDs
    pl: playersData,
    t: this.serverTime.toFixed(2) //Time local to server, limited to 2 decimal places
  };
};
/**
 * Send all player physics to given client
 * Only called upon connection
 * @param player player object to send to
 */
GameCore.prototype.dumpPhysicsToClient = function (player) {
  const allPlayers = [];
  for (const id in this.players) {
    if (this.players.hasOwnProperty(id)) {
      allPlayers.push(id);
    }
  }
  debug(this.generateServerUpdate(allPlayers));
  this.players[player.userID].instance.emit('onserverupdate', this.generateServerUpdate(allPlayers));
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
 * Takes about 0.250ms on average
 * Hashing each state doesn't make sense because each hash takes from .5-2ms and that doesn't make sense per player
 */
GameCore.prototype.updateState = function () {
  //Determine what changed and handle changes
  for (var playerID in this.players) {
    if (this.players.hasOwnProperty(playerID)) {
      var player = this.players[playerID];
      var changes = diff(player.oldState, player.state); //Takes 2-0.01ms (but much faster than hashing)
      if (!changes)
        changes = [];
      //Handle Changes
      for (var index = 0; index < changes.length; index++) {
        var change = changes[index];
        switch (change.path[0]) {
          case 'color':
            for (const key in this.players) { //Send all clients that a client changed color
              if (this.players.hasOwnProperty(key) && key !== playerID) {
                this.players[key].instance.send('s.pl.c.' + change.rhs + '.' + playerID); //Send which client changed to which color
              }
            }
            break;

          default:
            console.warn('Unhandled change at ' + change.path[0]);
        }
      }

      //Copy currentState to oldState
      player.oldState = deepcopy(player.state);  //Copy entire state (by memory, not reference)
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
