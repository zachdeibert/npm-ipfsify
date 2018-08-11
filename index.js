const child_process = require("child_process");
const fs = require("fs-extra");
const ipfsAPI = require("ipfs-api");
const npm = require("npm");
const os = require("os");
const path = require("path");
const process = require("process");
const recursive = require("recursive-readdir");

let ipfs = ipfsAPI("/ip4/127.0.0.1/tcp/5001");

function ipfsifyPackage(nodeModulesDir, packageName, packageMap, callback) {
    let modDir = path.join(nodeModulesDir, packageName);
    fs.readJson(path.join(modDir, "package.json"), (err, package_json) => {
        if (err) {
            callback(err);
        } else {
            let dependencies = package_json.dependencies ? Object.getOwnPropertyNames(package_json.dependencies) : [];
            let submodulesDir = path.join(modDir, "node_modules");
            let packages = [];
            let loop = i => {
                if (i < dependencies.length) {
                    if (packageMap[dependencies[i]]) {
                        loop(i + 1);
                    } else {
                        let loop2 = dir => {
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
                    recursive(modDir, (err, files) => {
                        if (err) {
                            callback(err, packages);
                        } else {
                            loop = i => {
                                if (i < files.length) {
                                    if (files[i].endsWith(".js")) {
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
                                        loop(i + 1);
                                    }
                                } else {
                                    package_json._where = "/npm-ipfsify";
                                    fs.writeFile(path.join(modDir, "package.json"), JSON.stringify(package_json), {
                                        "encoding": "utf8"
                                    }, err => {
                                        if (err) {
                                            callback(err, packages);
                                        } else {
                                            let dataFiles = [];
                                            let dirs = []
                                            loop = i => {
                                                if (i < files.length) {
                                                    if (files[i].indexOf("node_modules", modDir.length) < 0) {
                                                        fs.stat(files[i], (err, stats) => {
                                                            if (err) {
                                                                callback(err, packages);
                                                            } else {
                                                                if (stats.isDirectory()) {
                                                                    dirs.push(files[i]);
                                                                } else {
                                                                    dataFiles.push(files[i]);
                                                                }
                                                                loop(i + 1);
                                                            }
                                                        });
                                                    } else {
                                                        loop(i + 1);
                                                    }
                                                } else {
                                                    let stream = ipfs.files.addReadableStream();
                                                    stream.on("error", err => {
                                                        callback(err, packages);
                                                    });
                                                    stream.on("data", file => {
                                                        if (file.path === "package") {
                                                            packageMap[packageName] = file.hash;
                                                            packages.push({
                                                                "name": package_json.name,
                                                                "version": package_json.version,
                                                                "hash": file.hash
                                                            });
                                                            callback(null, packages);
                                                        }
                                                    });
                                                    dataFiles.forEach(file => {
                                                        stream.write({
                                                            "path": path.join("package", file.substr(modDir.length + 1)),
                                                            "content": fs.createReadStream(file)
                                                        });
                                                    });
                                                    dirs.forEach(dir => {
                                                        stream.write({
                                                            "path": path.join("package", dir.substr(modDir.length + 1))
                                                        });
                                                    });
                                                    stream.end();
                                                }
                                            };
                                            loop(0);
                                        }
                                    });
                                }
                            };
                            loop(0);
                        }
                    });
                }
            };
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
                fs.remove(dir, err2 => {
                    if (err2) {
                        console.error("Warning: could not delete temporary directory");
                    }
                    oldCallback(err, res);
                });
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
