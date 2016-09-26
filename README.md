# RaceMMO
A online racing game written in Node.js using Socket.io, Express and PIXI.js.

See Todo.html (Or run the server and Todo.html will be embedded into the homepage) for features not yet implemented, known bugs and possible additions in the future.

*Note: This repository is in rapid development and is not guaranteed to be (and often will not be) stable. Installation is currently not recommended for anything other than testing.*
*Also this has only been tested on linux and relies on bash for the run scripts.*
## Installation
Clone Repo, run `npm install` to install dependencies, create the directory `public/javascripts` if it doesn't already exist,
run `npm run build` and then run `npm run start` which will start the server on port 3000 or the environment variable `PORT`.
Navigate to [http://localhost:3000](http://localhost:3000) to view server.

See [http://racemmo.com](http://racemmo.com) for more information.

The networking is based upon [Real Time Multiplayer in HTML5](http://buildnewgames.com/real-time-multiplayer/) by [Sven Bergstrom](http://underscorediscovery.com/)
