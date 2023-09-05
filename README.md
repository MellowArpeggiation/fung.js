# FUNG.js

See it in action: [rpg8.me/fung](http://rpg8.me/fung)

[![FUNG growing in cyan and magenta](https://github.com/MellowArpeggiation/fung.js/blob/main/screenshot.png)](http://rpg8.me/fung)

An HTML5 Canvas React element that renders the FUNG, a slime mould cellular automata rendered onto a Game of Life (GoL) layer.

This implementation is purely WebGL and is derived from the implementation developed for FUNG available on [Steam](https://store.steampowered.com/app/2467310/FUNG/) and [itch.io](https://mellowarpeggiation.itch.io/fung).

`fung.js` is funded by purchases of the game, if you found this useful please consider picking up a copy!

Features include:
* Double buffered asymmetric diffusion, which causes the FUNG to slowly fall down under gravity
* Double buffered GoL that is seeded by the slime mould automata
* Agent position is encoded using floating point WebGL textures, with fallbacks to half-floats for maximum device support

## Installation and usage
You can install the component to your project via npm:
```
npm install @mellowarpeggiation/fung.js --save
```

Then use it within your app:
```
import React from 'react';
import { FungCanvas } from "@mellowarpeggiation/fung.js"

export default function App() {
  return (
    <div className="App">
      <FungCanvas
        fromColor="magenta"
        toColor="cyan"
      />
    </div>
  );
}
```

## Props
All properties can be updated on the fly without having to reinitialise any buffers or redraw the canvas from scratch. The properties available include:
* `fromColor` - The outer colour of the mould - defaults to `lime`,
* `toColor` - The inner colour of the mould - defaults to `yellow`,
* `agentCount` - The number of agents to simulate - defaults to `2000`,
* `moveSpeed` - The movement speed of the agents in pixels per second. Should not exceed the framerate - defaults to `50`
* `turnSpeed` - The turning speed of the agents in radians per second - defaults to `12`
* `senseDistance` - How far each forward each agent "smells" the diffusion layer, to follow existing paths - defaults to `8`
* `senseAngle` - What angle (in radians) each agent checks when sensing (imagine a line from the agents head pointing forwards, and two lines either side at this angle both positive and negative) - defaults to `0.4`,
* `diffusionRate` - Sets how quickly the trail spreads out (and indirectly, how much gravity applies to the agents) - defaults to `32`,
* `evaporationRate` - Sets how quickly the trail evaporates - defaults to `0.18`,
* `densitySpread` - Sets the trail density limit at which the agent begin to spread out - defaults to `0.8`,
* `debug` - A handy debug mode to show just the mould trail without the GoL layer - defaults to `false`,

## License
MIT Licensed. Copyright (c) George Paton 2023