'use strict';
/**
 * Server functions for clientside only
 */
var debug = require('debug')('RaceMMO:ClientCore');
var dat = require('../client/lib/dat.gui');

/**
 * Setup Client Configuration
 * Initialize Client Vars
 */
GameCore.prototype.clientCreateConfiguration = function () {
  this.showHelp = false; //Help Text
  this.freezeLogic = false; //Freeze update timers
  this.naiveApproach = false; //Naive Approach being poor netcode
  this.showServerPos = false;
  this.showDestPos = false; //Show Interpolation Goal
  this.clientPredict = true; //Use clientside prediction
  this.inputSeq = 0; //Initial input sequence number
  this.clientSmoothing = true; //Clientside prediction uses smoothing
  this.clientSmooth = 25; //Amount of smoothing to apply to client update dest

  this.netLatency = 0.001; //Time from just server>client or client>server (ping/2)
  this.netPing = 0.001; //Round trip time from server and back
  this.lastPingTime = 0.001; //Last time we sent a ping

  this.netOffset = 100; //100ms latency between server and client interpolation for other clients
  this.bufferSize = 2; //The size of the server history to keep for interpolation
  this.targetTime = 0.01; //Time we want to be in the server timeline

  this.clientTime = 0.01; //Client's clock
  this.serverTime = 0.001; //Time reported from server

  this.dt = 0.016; //Time the last frame took
  this.fps = 0; //1/this.dt
  this.fpsAvgCount = 0; //Samples we have of fps
  this.fpsAvg = 0; //Current avg fps
  this.fpsAvgAcc = 0; //Accumulation of last averagecount

  this.lit = 0;
  this.llt = new Date().getTime();
};

/******************
 Player Logic
 *****************/

/**
 * Create player on client
 * @param id id of player
 */
GameCore.prototype.clientCreateNewPlayer = function (id) {
  this.players[id] = new GamePlayer(this);
  if (id !== 0) { //They were assigned an id, meaning they are online
    this.players[id].state.online = true;
    this.players[id].state.label = 'connected';
  }

  if (this.socket.userID !== id) { //If we aren't the client player create ghosts
    this.ghosts.posOther[id] = new GamePlayer(this);
    this.ghosts.posOther[id].state.infoColor = 'rgba(255,255,255,0.1)';
    this.ghosts.serverPosOther[id] = new GamePlayer(this);
    this.ghosts.serverPosOther[id].state.infoColor = 'rgba(255,255,255,0.2)';
    this.ghosts.posOther[id].state.label = 'destPos';
    this.ghosts.serverPosOther[id].state.label = 'serverPos';
    this.ghosts.posOther[id].physicsState.pos = {x: 0, y: 0};
    this.ghosts.serverPosOther[id].physicsState.pos = {x: 0, y: 0};
  }
};
/**
 * Change color of current client and send that color to the server.
 * @param [color] optional, if not given will get color from localstorage or use random color, otherwise will use color specified
 */
GameCore.prototype.clientChangeColor = function (color) {
  if (this.fakeClient)
    return;
  if (!color) {
    color = (localStorage.getItem('color') || GameCore.mathUtils.randomColor());
  }
  this.players[this.socket.userID].state.color = color;
  localStorage.setItem('color', color);
  this.socket.send('c.' + color); //'c' for
};
/**
 * Handle input clientside
 *  Parse Input and send to server
 *  @param manualInput manually input an array (optionally)
 *  @returns {*} Movement Vector from resulting input
 */
GameCore.prototype.clientHandleInput = function (manualInput) {
  var xDir = 0;
  var yDir = 0;
  var input = [];
  if (manualInput) {
    manualInput.forEach(function (val) {
      input.push(val);
    });
  }

  if (this.keyboard) { //Skip this during tests if it is undefined
    if (this.keyboard.pressed('A') || this.keyboard.pressed('left')) {
      xDir = -1;
      input.push('l');
    }
    if (this.keyboard.pressed('D') || this.keyboard.pressed('right')) {
      xDir = 1;
      input.push('r');
    }
    if (this.keyboard.pressed('S') || this.keyboard.pressed('down')) {
      yDir = 1;
      input.push('d');
    }
    if (this.keyboard.pressed('W') || this.keyboard.pressed('up')) {
      yDir = -1;
      input.push('u');
    }
  }

  if (input.length) {
    this.inputSeq += 1;
    this.players[this.socket.userID].physicsState.inputs.push({ //Store input state as a snapshot
      inputs: input,
      time: this.localTime.fixed(3),
      seq: this.inputSeq
    });

    //Send server packet
    var serverPacket = 'i.'; //Input packets labeled with 'i'
    serverPacket += input.join('-') + '.';
    serverPacket += this.localTime.toFixed(3).replace('.', '-') + '.';
    serverPacket += this.inputSeq;

    this.socket.send(serverPacket); //Send to server
    return this.physicsMovementVectorFromDirection(xDir, yDir); //Return vector if needed
  } else {
    return {x: 0, y: 0};
  }
};
/**
 * Remove Player from simulation
 * @param id player to remove
 */
GameCore.prototype.clientRemovePlayer = function (id) {
  delete this.players[id];

  if (this.socket.userID !== id) { //if we aren't the client player, remove the ghosts
    delete this.ghosts.posOther[id];
    delete this.ghosts.serverPosOther[id];
  }
};

/************
 DRAWING
 ***********/

/**
 * Create Debug dat.GUI
 */
GameCore.prototype.clientCreateDebugGui = function () {
  this.gui = new dat.GUI();

  var _playerSettings = this.gui.addFolder('Your Settings');
  this.colorControl = _playerSettings.addColor(this.players[this.socket.userID].state, 'color');
  this.colorControl.onChange(function (value) {
    this.clientChangeColor(value);
  }.bind(this));
  _playerSettings.open();

  var _otherSettings = this.gui.addFolder('Methods');
  _otherSettings.add(this, 'naiveApproach').listen();
  _otherSettings.add(this, 'clientSmoothing').listen();
  _otherSettings.add(this, 'clientSmooth').min(1).listen();
  _otherSettings.add(this, 'clientPredict').listen();

  var _debugSettings = this.gui.addFolder('Debug View');
  _debugSettings.add(this, 'showHelp').listen();
  _debugSettings.add(this, 'fpsAvg').listen();
  _debugSettings.add(this, 'showServerPos').listen();
  _debugSettings.add(this, 'showDestPos').listen();
  _debugSettings.add(this, 'localTime').listen();
  _debugSettings.add(this, 'freezeLogic').listen();
  _debugSettings.open();

  var _conSettings = this.gui.addFolder('connection');
  _conSettings.add(this, 'netLatency').step(0.001).listen();
  _conSettings.add(this, 'netPing').step(0.001).listen();

  _conSettings.open();

  var _netSettings = this.gui.addFolder('Networking');
  _netSettings.add(this, 'netOffset').min(0.01).step(1).listen();
  _netSettings.add(this, 'serverTime').step(0.01).listen();
  _netSettings.add(this, 'clientTime').step(0.01).listen();
  _netSettings.open();
};
/**
 * Calculate FPS
 */
GameCore.prototype.clientRefreshFPS = function () {
  //Store the fps for 10 frames
  this.fps = 1 / this.dt;
  this.fpsAvgAcc += this.fps;
  this.fpsAvgCount++;

  if (this.fpsAvgCount >= 10) {
    this.fpsAvg = this.fpsAvgAcc / 10;
    this.fpsAvgCount = 1;
    this.fpsAvgAcc = this.fps;
  }
};
/**
 * Draw help information if requested
 */
GameCore.prototype.clientDrawInfo = function () {
  this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
  if (this.showHelp) {
    this.ctx.fillText('netOffset : local offset between players and their server updates.', 10, 30);
    this.ctx.fillText('serverTime : last known game time on server', 10, 70);
    this.ctx.fillText('clientTime : delayed game time on client for other players only (includes the net_offset)', 10, 90);
    this.ctx.fillText('netLatency : Time from you to the server. ', 10, 130);
    this.ctx.fillText('netPing : Time from you to the server and back. ', 10, 150);
    this.ctx.fillText('clientSmoothing/clientSmooth : When updating players information from the server, it can smooth them out.', 10, 210);
    this.ctx.fillText(' This only applies to other clients when prediction is enabled, and applies to local player with no prediction.', 170, 230);
  }
  this.ctx.fillStyle = 'rgba(255,255,255,1)'; //Reset fillstyle
};
/**
 * Draw server ID at bottom of canvas
 */
GameCore.prototype.clientDrawServer = function () {
  if (!this.instance) {
    return;
  }
  this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
  this.ctx.fillText('Server: ' + this.instance.id, 0, this.world.height - 25);
  this.ctx.fillStyle = 'rgba(255,255,255,1)'; //Reset Fillstyle
};

/*************
 NETWORKING
 ************/
//Roughly organized in order of connection lifecycle

/**
 * Handle Connecting to the server
 * Only called in the constructor of GameCore
 */
GameCore.prototype.clientConnectToServer = function () {
  if (this.fakeClient)
    this.socket = require('../test/testUtils').connect();
  else
    this.socket = require('socket.io-client').connect();

  this.socket.userID = 0;
  this.socket.on('connect', function () {
    this.players[this.socket.userID].state.label = 'connecting'; //We are not 'connected' until we have a server ID and we are placed in a server
  }.bind(this));

  this.socket.on('disconnect', this.clientOnDisconnect.bind(this)); //Sent when we are disconnected (network, serverDown...)
  this.socket.on('onserverupdate', this.clientOnServerUpdateReceived.bind(this)); //Sent each tick of server simulation (authoritative update)
  this.socket.on('onconnected', this.clientOnConnected.bind(this)); //Handle when we connect to server
  this.socket.on('error', this.clientOnDisconnect.bind(this)); //On an error show that we aren't connected
  this.socket.on('message', this.clientOnNetMessage.bind(this)); //On message parse the commands and send to handlers
  this.socket.on('onstatedump', this.clientParseStateDump.bind(this)); //Handle state dumps (usually upon connecting to game)
};
/**
 * Called when any message from a server is received
 * @param data server packet received
 */
GameCore.prototype.clientOnNetMessage = function (data) {
  var command = data.split('.'); //'.' delimits commands
  switch (command[0]) {
    case 's': //Server Message
      switch (command[1]) {
        case 'y': //You (a message about our current player)
          switch (command[2]) {
            case 'j': //We are joining a lobby
              this.clientOnJoinGame(command[3], command[4]); //GameID, ServerTime
              break;
          }
          break;
        case 'pl': //Players (a message about another player in our game)
          switch (command[2]) {
            case 'j': //A player is joining
              this.clientOnOtherClientJoinGame(command[3]); //userID
              break;
            case 'c': //Other player color changed
              this.clientOnOtherClientColorChange(command[4], command[3]); //client id that changed, color
              break;
            case 'd': //Other player disconnected
              this.clientOnOtherClientDisconnect(command[3]);
              break;
          }
          break;
        case 'e': //Game has ended
          this.clientOnDisconnect(command[2]);
          break;
        case 'p': //Server Ping
          this.clientOnPing(command[2]);
          break;
      }
      break; //If its anything but a server message we ignore it
  }
};
/**
 * Server gave us a game
 * @param data  Parsed Data from Server
 */
GameCore.prototype.clientOnConnected = function (data) {
  var selfState = this.players[this.socket.userID].state;
  selfState.id = data.id;
  selfState.infoColor = '#cc0000';
  selfState.label = 'YOU';
  selfState.online = true;

  //Migrate Current Client from default ID 0 to its given ID
  debug('Server Assigned us ID: ' + data.id);
  this.players[data.id] = this.players[this.socket.userID];
  delete this.players[this.socket.userID]; //Complete the move
  this.socket.userID = data.id;
};
/**
 * Handle Current Client Joining a Game
 * @param gameID  ID of game
 * @param gameTime server time
 */
GameCore.prototype.clientOnJoinGame = function (gameID, gameTime) {
  this.clientChangeColor(); //Send color to other server in case it doesn't already have it.
  var selfState = this.players[this.socket.userID].state;
  selfState.infoColor = '#00bb00';

  this.instance = {id: gameID};

  var serverTime = parseFloat(gameTime.replace('-', '.'));
  this.localTime = serverTime + this.netLatency;
};
/**
 * Parse full state data for all the clients in the server.
 * Usually given upon connecting to new game
 * Overrides all previous state data
 * @param stateDump dump of all the clients and their states from the server
 */
GameCore.prototype.clientParseStateDump = function (stateDump) {
  for (var x = 0; x < stateDump.length; x++) {
    var id = stateDump[x].id;
    this.clientOnOtherClientJoinGame(id);
    var state = stateDump[x].state;
    var current = this.players[id].state;
    for (var attrib in state) {
      //noinspection JSUnfilteredForInLoop
      current[attrib] = state[attrib];
    }
  }
};
/**
 * Process updates from the server
 * @param data update packet received from the server
 */
GameCore.prototype.clientOnServerUpdateReceived = function (data) {
  this.serverTime = data.t; //Server time (can be used to calc latency)
  this.clientTime = this.serverTime - (this.netOffset / 1000); //Latency Offset

  //debug('clientTime off by '+(this.serverTime - this.clientTime));
  var pl = []; //Process data (can't send associative array over socketIO, so I number it then restore it here)
  for (var x = 0; x < data.pl.length; x++) {
    pl[data.pl[x].id] = {pos: data.pl[x].pos, is: data.pl[x].is};
    if (!this.players[data.pl[x].id]) { //New player since last update
      console.warn('Extra player on server! ' + data.pl[x].id);
    }
  }
  if (this.serverUpdates.length === 0) { //Upon first tick, update position from server
    this.players[this.socket.userID].physicsState.currentState.pos = GameCore.mathUtils.pos(pl[this.socket.userID].pos);
  }
  if (this.naiveApproach) {
    for (var key in pl) {
      if (pl.hasOwnProperty(key)) {
        this.players[key].physicsState.pos = GameCore.mathUtils.pos(pl[key].pos);
      }
    }
  } else { //Lerp Approach
    //Cache data from server, play it back with the netOffset and interpolate between points
    this.serverUpdates.push({pl: pl, t: data.t}); //Add the formatted packet to the end of the array
    for (let index = 0; index < data.pl.length; index++) {
      this.latestServerData[data.pl[index].id] = {pos: data.pl[index].pos, is: data.pl[index].is, t: data.t};
    }

    //Limit buffer in seconds of updates 60fps*bufferSeconds=samples
    if (this.serverUpdates.length >= (60 * this.bufferSize)) {
      this.serverUpdates.splice(0, 1); //Remove index 0
    }
    this.clientProcessNetPredictionCorrection();
  }
};
/**
 * Upon being pinged by server
 * @param data  Parsed Data from Server
 */
GameCore.prototype.clientOnPing = function (data) {
  this.netPing = new Date().getTime() - parseFloat(data);
  this.netLatency = this.netPing / 2;
  this.netOffset = Math.max(1, this.netPing); //Calculate command offset on server based on ping to server
};
/**
 * Add player who has connected to the server
 * @param otherID id of player who has connected
 */
GameCore.prototype.clientOnOtherClientJoinGame = function (otherID) {
  this.createNewPlayer({userID: otherID});
};
/**
 * Called when the other client changes its color
 * @param id Client who changed color
 * @param color  Parsed Data from Server
 */
GameCore.prototype.clientOnOtherClientColorChange = function (id, color) {
  if (id === this.socket.userID)
    console.warn('The server is overriding your color!');
  this.players[id].state.color = color;
};
/**
 * Remove player who has disconnected from the server
 * @param otherID id of player that disconnected
 */
GameCore.prototype.clientOnOtherClientDisconnect = function (otherID) {
  this.removePlayer({userID: otherID});
};
/**
 * Called once the client is dropped (connection to server lost)
 * @param data data from disconnect command
 */
GameCore.prototype.clientOnDisconnect = function (data) {
  //We don't know if the other player is still connected, we arent so everything goes offline
  console.warn('Server Connection Lost!');
  debug(data);

  var selfState = this.players[this.socket.userID].state;
  selfState.infoColor = 'rgba(255,255,255,0.1)';
  selfState.label = 'not-connected';
  selfState.online = false;

  for (var key in this.players) {
    if (this.players.hasOwnProperty(key) && key !== this.socket.userID) {
      this.removePlayer({userID: key});
      this.serverUpdates = [];
    }
  }
};

/*********
 Timers
 ********/

/**
 * Client Update Loop
 *  Draw, Input, Physics
 */
GameCore.prototype.clientUpdate = function () {
  if (this.freezeLogic)
    return; //Do nothing if we are freezing logic

  if (!this.fakeClient) {
    this.ctx.clearRect(0, 0, 720, 480);
    this.clientDrawInfo();
    this.clientDrawServer();
  }
  if (!this.naiveApproach) {
    this.clientProcessNetUpdates();
  }
  for (var key in this.players) {
    if (this.players.hasOwnProperty(key) && key !== this.socket.userID) { //Draw all other players
      this.players[key].draw();
    }
  }
  this.clientUpdateLocalPosition();
  this.players[this.socket.userID].draw(); //Draw after others to be smoother I think.

  if (this.showDestPos && !this.naiveApproach) {
    for (var key1 in this.ghosts.posOther) {
      if (this.ghosts.posOther.hasOwnProperty(key1)) {
        this.ghosts.posOther[key1].draw(); //Draw Other Ghost
      }
    }

  }
  if (this.showServerPos && !this.naiveApproach) {
    this.ghosts.serverPosSelf.draw(); //Draw our ghost
    for (var key2 in this.ghosts.serverPosOther) {
      if (this.ghosts.serverPosOther.hasOwnProperty(key2)) {
        this.ghosts.serverPosOther[key2].draw();
      }
    }
  }
  this.clientRefreshFPS(); //Calculate FPS Average
};

/**
 * Make a ping between the client and server every second to ensure they are connected
 */
GameCore.prototype.clientCreatePingTimer = function () {
  setInterval(function () {
    this.lastPingTime = new Date().getTime();
    this.socket.send('p.' + (this.lastPingTime)); //'p' for ping
  }.bind(this), 1000);
};

/*******************
 LATENCY HANDLING
 ******************/

/**
 * Calculate Client Prediction
 */
GameCore.prototype.clientProcessNetPredictionCorrection = function () {
  //NOTE: this.serverUpdates.pl is the associative array with the key as player id's
  if (!this.serverUpdates.length) return; //Nothing to do if there are no updates

  var myData = this.latestServerData[this.socket.userID];
  var myServerPos = myData.pos; //Get the client position
  this.ghosts.serverPosSelf.physicsState.pos = GameCore.mathUtils.pos(myServerPos); //Update Ghost with real position

  //Local Input Prediction
  var myLastInputOnServer = myData.is;
  if (myLastInputOnServer) { //We haven't moved from our initial position if undef
    var lastInputSeqIndex = -1; //Last input sequence from my input
    //Find input on server
    for (var i = 0; i < this.players[this.socket.userID].physicsState.inputs.length; ++i) {
      //noinspection Eslint (Double equals is needed, not triple)
      if (this.players[this.socket.userID].physicsState.inputs[i].seq == myLastInputOnServer) {
        lastInputSeqIndex = i;
        break;
      }
    }
    //Do calculations based on last input accepted in server
    if (lastInputSeqIndex !== -1) { //Server acknowledges that our inputs were accepted
      var numberToClear = Math.abs(lastInputSeqIndex - (-1)); //Clear inputs we confirmed are on server
      this.players[this.socket.userID].physicsState.inputs.splice(0, numberToClear);
      this.players[this.socket.userID].physicsState.currentState.pos = GameCore.mathUtils.pos(myServerPos); //We know we are at this position because the server confirmed it
      this.players[this.socket.userID].physicsState.lastInputSeq = lastInputSeqIndex;
      //Reapply all inputs that the server hasn't yet confirmed to 'keep' our position the same while confirming the server position
      this.clientUpdatePhysics();
    } else if (this.players[this.socket.userID].physicsState.inputs.length > (this.netPing / GameCore.PHYSICS_UPDATE_TIME)) { //Warn when inputs haven't been accepted that should have.
      console.warn(this.players[this.socket.userID].physicsState.inputs.length + ' Inputs have not been accepted by server');
    }
  }
};
/**
 * Process updates from the server
 */
GameCore.prototype.clientProcessNetUpdates = function () {
  if (!this.serverUpdates.length) return; //Nothing to do if there are no updates

  //Find the position in the timeline of the updates we store
  var currentTime = this.localTime;
  var count = this.serverUpdates.length - 1;
  var target = null;
  var previous = null;

  //Look for oldest update since newest ones are at the end, if our time isn't on timeline it will be expensive!
  for (var i = 0; i < count; ++i) {
    var point = this.serverUpdates[i];
    var nextPoint = this.serverUpdates[i + 1];

    if (currentTime > point.t && currentTime < nextPoint.t) { //If the server update was between the current time and the last confirmed update
      //We found the most recent server update that we haven't processed yet
      target = nextPoint;
      previous = point;
      //debug(point.t+' '+currentTime+' '+nextPoint.t);
      break;
    }
  }
  if (!target) { //Can occur because there wasn't a state change recently. Use last known server pos and move to it
    target = this.serverUpdates[this.serverUpdates.length-1];
    previous = this.serverUpdates[this.serverUpdates.length-1];
  }

  //Interpolate between target and previous destination
  if (target && previous) {
    //Timing Math
    this.targetTime = target.t;

    var difference = this.targetTime - currentTime;
    var maxDifference = (target.t - previous.t).fixed(3);
    var timePoint = (difference / maxDifference).fixed(3);

    //Safeguard extreme cases (divide by 0)
    if (isNaN(timePoint))timePoint = 0;
    if (timePoint === -Infinity)timePoint = 0;
    if (timePoint === Infinity)timePoint = 0;

    //Movement Math
    for (var id in this.players) {
      if (this.players.hasOwnProperty(id) && id !== this.socket.userID) { //Process everyone other than current client
        if (!this.latestServerData[id]) { //We don't exist in the server update, probably never notified player we joined
          console.warn('Player not in server update!');
          continue;
        }
        var otherServerPos = this.latestServerData[id].pos; //The exact server positions, used for the ghost
        var otherTargetPos = target.pl[id] ? target.pl[id].pos : undefined; //If player exists in these server states, use their position. If not undefined will be correctly handled below
        var otherPastPos = previous.pl[id] ? previous.pl[id].pos : undefined;

        //Update Destination Ghost
        this.ghosts.serverPosOther[id].physicsState.pos = GameCore.mathUtils.pos(otherServerPos);

        //ghosts.posOther is the destination position, if there is no past position theres no destination
        if (otherPastPos && otherTargetPos) { //If we can update the ghost using lerp great, if not fall back to simply plugging in from server update
          this.ghosts.posOther[id].physicsState.pos = GameCore.mathUtils.vLerp(otherPastPos, otherTargetPos, timePoint); //Linear interpolation between past and target position at a given time
        } else { //Player didn't exist in last server update, so simply plug in his position
          this.ghosts.posOther[id].physicsState.pos = GameCore.mathUtils.pos(otherServerPos);
        }
        if (this.clientSmoothing && otherPastPos && otherTargetPos) { //Meets the conditions to do lerp, if not we assume we will have more data next server update or smoothing is off
          this.players[id].physicsState.pos = GameCore.mathUtils.vLerp(this.players[id].physicsState.pos, this.ghosts.posOther[id].physicsState.pos, this._pdt * this.clientSmooth); //lerp serverPos with directionVector with timeDelta*smoothAmt
        } else { //No Smoothing
          this.players[id].physicsState.pos = GameCore.mathUtils.pos(this.ghosts.posOther[id].physicsState.pos); //Player Position is the position on the server
        }
      }
    }
    //Called if we aren't predicting client movement, update position of current client from server
    if (!this.clientPredict && !this.naiveApproach) {
      var myServerPos = this.latestServerData.pl[this.socket.userID].pos;
      var myTarget = target.pl[this.socket.userID];
      //Why would we not exist in the future?
      var myPast = previous.pl[this.socket.userID];
      var myTargetPos, myPastPos;
      if (myTarget && myPast) {
        myTargetPos = myTarget.pos;
        myPastPos = myPast.pos;
      } else { //We didn't exist in the past or in the future (because of a disconnect/reconnect)
        myTargetPos = myServerPos;
        myPastPos = myServerPos;
      }

      this.ghosts.serverPosSelf.physicsState.pos = GameCore.mathUtils.pos(myServerPos); //Snap ghost to new server pos
      var localTarget = GameCore.mathUtils.vLerp(myPastPos, myTargetPos, timePoint);

      if (this.clientSmoothing) {
        this.players[this.socket.userID].physicsState.pos = GameCore.mathUtils.vLerp(this.players[this.socket.userID].physicsState.pos, localTarget, this._pdt * this.clientSmooth);
      } else {
        this.players[this.socket.userID].physicsState.pos = GameCore.mathUtils.pos(localTarget);
      }
    }
  }
};
/**
 * Update client position and states
 */
GameCore.prototype.clientUpdateLocalPosition = function () {
  if (this.clientPredict) {
    var currentState = this.players[this.socket.userID].physicsState.currentState.pos;
    this.players[this.socket.userID].physicsState.pos = currentState; //Ensure visual position matches state
    this.checkCollision(this.players[this.socket.userID]); //Keep in world
  }
};
/**
 * Calculate Physics clientside
 */
GameCore.prototype.clientUpdatePhysics = function () {
  if (this.freezeLogic)
    return; //Don't do anything if logic is frozen
  this.clientHandleInput();
  this.clientUpdateLocalPosition();

  if (this.clientPredict) {
    //Fetch the direction from input buffer and use it to smooth visuals
    var self = this.players[this.socket.userID];
    self.physicsState.oldPos = GameCore.mathUtils.pos(self.physicsState.currentState.pos);
    var nd = this.processInput(self.physicsState); //new direction vector
    self.physicsState.currentState.pos = GameCore.mathUtils.vAdd(self.physicsState.oldPos, nd);
    self.physicsState.stateTime = this.localTime;
  }
};
