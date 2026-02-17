# veform-js

A JavaScript/TypeScript library for Veform.

## Installation

```bash
yarn add veform-js
```

## Usage

### As a Browser Global (Direct Script Tag)

Include the browser bundle directly in your HTML:

```html
<script src="path/to/veform-js/dist/veform.browser.js"></script>
<script>
  // The library automatically prints "hello" when loaded
  console.log(Veform.greet("World")); // Output: Hello, World!
  console.log(Veform.version); // Output: 0.1.0
</script>
```

Or use the minified version:

```html
<script src="path/to/veform-js/dist/veform.browser.min.js"></script>
```

### As an ES Module (Browser)

```html
<script type="module">
  import { greet, version } from './path/to/veform-js/dist/index.js';
  
  console.log(greet("World")); // Output: Hello, World!
  console.log(version); // Output: 0.1.0
</script>
```

### TypeScript/ES6 (with bundler)

```typescript
import { greet, version } from 'veform-js';

// The library will print "hello" to the console when imported
console.log(greet("World")); // Output: Hello, World!
console.log(version); // Output: 0.1.0
```

### CommonJS (Node.js)

```javascript
const { greet, version } = require('veform-js');

// The library will print "hello" to the console when imported
console.log(greet("World")); // Output: Hello, World!
console.log(version); // Output: 0.1.0
```

## Development

### Build

```bash
yarn install
yarn build
```

### Watch mode

```bash
yarn watch
```

## License

See [LICENSE](./LICENSE) file.
