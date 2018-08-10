const child_process = require("child_process");
const fs = require("fs-extra");
const npm = require("npm");
const os = require("os");
const path = require("path");
const process = require("process");
const recursive = require("recursive-readdir");

function ipfsifyPackage(nodeModulesDir, packageName, packageMap, callback) {
    fs.readJson(path.join(nodeModulesDir, packageName, "package.json"), (err, package_json) => {
        if (err) {
            callback(err);
        } else {
            let dependencies = package_json.dependencies ? Object.getOwnPropertyNames(package_json.dependencies) : [];
            let submodulesDir = path.join(nodeModulesDir, packageName, "node_modules");
            let packages = [];
            function loop(i) {
                if (i < dependencies.length) {
                    if (packageMap[dependencies[i]]) {
                        loop(i + 1);
                    } else {
                        function loop2(dir) {
                            fs.access(path.join(dir, dependencies[i]), fs.constants.F_OK, err => {
                                if (err) {
                                    let parent = path.dirname(path.dirname(dir));
                                    if (path.basename(parent) === "node_modules") {
                                        loop2(parent);
                                    } else {
                                        callback(err, packages);
                                    }
                                } else {
                                    ipfsifyPackage(dir, dependencies[i], packageMap, (err, pkgs) => {
                                        if (pkgs) {
                                            packages.push(...pkgs);
                                        }
                                        if (err) {
                                            callback(err, packages);
                                        } else {
                                            loop(i + 1);
                                        }
                                    });
                                }
                            });
                        }
                        loop2(submodulesDir);
                    }
                } else {
                    let modDir = path.join(nodeModulesDir, packageName);
                    recursive(modDir, (err, files) => {
                        if (err) {
                            callback(err, packages);
                        } else {
                            files = files.filter(file => file.endsWith(".js"));
                            function loop(i) {
                                if (i < files.length) {
                                    fs.readFile(files[i], {
                                        "encoding": "utf8"
                                    }, (err, data) => {
                                        if (err) {
                                            callback(err, packages);
                                        } else {
                                            let regex = /(require\s*\(\s*['"])([^'"]+)(['"]\s*\))/gm;
                                            let match;
                                            while (match = regex.exec(data)) {
                                                if (packageMap[match[2]]) {
                                                    data = data.substr(0, match.index) +
                                                            match[1] +
                                                            "/ipfs/" +
                                                            packageMap[match[2]] +
                                                            match[3] +
                                                            data.substr(match.index + match[0].length);
                                                }
                                            }
                                            fs.writeFile(files[i], data, {
                                                "encoding": "utf8"
                                            }, err => {
                                                if (err) {
                                                    callback(err, packages);
                                                } else {
                                                    loop(i + 1);
                                                }
                                            })
                                        }
                                    });
                                } else {
                                    child_process.execFile("ipfs", [ "add", "-r", "-Q", "-H", modDir ], (err, hash, stderr) => {
                                        if (err) {
                                            callback(err, packages);
                                        } else if (stderr) {
                                            callback(stderr, packages);
                                        } else {
                                            hash = hash.trim()
                                            packageMap[packageName] = hash;
                                            packages.push({
                                                "name": package_json.name,
                                                "version": package_json.version,
                                                "hash": hash
                                            });
                                            callback(null, packages);
                                        }
                                    });
                                }
                            }
                            loop(0);
                        }
                    });
                }
            }
            loop(0);
        }
    });
}

function ipfsify(packageName, callback) {
    fs.mkdtemp(path.join(os.tmpdir(), "npm-ipfsify-"), (err, dir) => {
        if (err) {
            callback(err);
        } else {
            let oldCallback = callback;
            callback = (err, res) => {
                process.chdir("..");
                //fs.remove(dir, err2 => {
                //    if (err2) {
                //        console.error("Warning: could not delete temporary directory");
                //    }
                    oldCallback(err, res);
                //});
            };
            process.chdir(dir);
            npm.load({
                "loaded": false
            }, err => {
                if (err) {
                    callback(err);
                } else {
                    npm.commands.install([ packageName ], err => {
                        if (err) {
                            callback(err);
                        } else {
                            ipfsifyPackage(path.join(dir, "node_modules"), packageName.split("@")[0], {}, callback);
                        }
                    });
                    npm.on("log", console.log.bind(console));
                }
            });
        }
    });
}

module.exports = {
    "ipfsifyPackage": ipfsifyPackage,
    "ipfsify": ipfsify
};
