#!/usr/bin/env node
const ipfsify = require("..");
const process = require("process");

if (process.argv.length === 3) {
    ipfsify.ipfsify(process.argv[2], (err, packages) => {
        if (err) {
            console.error(err);
            if (packages && packages.length > 0) {
                console.log(`Successfully converted ${packages.length} packages to IPFS:`);
                packages.forEach(package => {
                    console.log(`  ${package.name}@${package.version} => ${package.hash}`);
                });
            }
            process.exit(1);
        } else {
            console.log(`Successfully converted ${packages.length} packages to IPFS:`);
            packages.forEach(package => {
                console.log(`  ${package.name}@${package.version} => ${package.hash}`);
            });
        }
    });
} else {
    console.error(`Usage: ${process.argv0} ${process.argv[1]} <npm package>`);
    process.exit(1);
}
