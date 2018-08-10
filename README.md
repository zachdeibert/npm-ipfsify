# npm-ipfsify

Node.JS Package Management for the Distributed Web

## Converting Package

Install npm-ipfsify:

```bash
npm install npm-ipfsify
```

Convert package from NPM to IPFS:

```bash
npm-ipfsify hello-world-npm
```

Convert specific version of package:

```bash
npm-ipfsify hello-world-npm@1.1.1
```

## Using Converted Packages

```node
const helloWorld = require("/ipfs/QmZ1KUC97ayyG7xCEKLP8C5twSwaGG4tbFXVeQfQTqskPy");

console.log(helloWorld.helloWorld());
```
