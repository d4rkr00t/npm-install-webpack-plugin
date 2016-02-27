var spawn = require("cross-spawn");
var fs = require("fs");
var kebabCase = require("lodash.kebabcase");
var path = require("path");
var util = require("util");

var INTERNAL = /^\./; // Match "./client", "../something", etc.
var EXTERNAL = /^[a-z\-0-9]+$/; // Match "react", "path", "fs", etc.

/**
 * Checks whether or not we should search modules in node_modules directory.
 *
 * If node_modules doesn't exist should not search there.
 * If both save and saveDev options disabled should search in node_modules.
 * If package.json doesn't exists or dependencies and devDependencies are empty should search though.
 *
 * @param {Object} pkg
 * @param {Object|undefined} pkg.dependencies
 * @param {Object|undefined} pkg.devDependencies
 * @param {Object} options
 * @param {Boolean} isNodeModulesExists
 * @return {Boolean}
 */
function isShouldCheckInNodeModules(pkg, options, isNodeModulesExists) {
  if (!isNodeModulesExists) return;
  if (!options.save && !options.saveDev) return true;

  var deps = pkg.dependencies ? Object.keys(pkg.dependencies) : [];
  var devDeps = pkg.devDependencies ? Object.keys(pkg.devDependencies) : [];

  if (!deps && !devDeps) return true;
}

module.exports.check = function(request, options) {
  options = options || {};
  var namespaced = request.charAt(0) === "@";
  var dep = request.split("/")
    .slice(0, namespaced ? 2 : 1)
    .join("/")
  ;
  var pkg = {};
  var nodeModulesDir = path.join(process.cwd(), "node_modules");
  var isNodeModulesExists;

  try {
    isNodeModulesExists = fs.lstatSync(nodeModulesDir).isDirectory();
  } catch (e) {}

  // Ignore relative modules, which aren't installed by NPM
  if (!dep.match(EXTERNAL) && !namespaced) {
    return;
  }

  try {
    var pkgPath = require.resolve(path.join(process.cwd(), "package.json"));
    var pkg = require(pkgPath);

    // Remove cached copy for future checks
    delete require.cache[pkgPath];
  } catch(e) {
    // package.json doesn't exist
  }

  if (isShouldCheckInNodeModules(pkg, options, isNodeModulesExists)) {
    var dirs = fs.readdirSync(nodeModulesDir);

    pkg = {
      dependencies: dirs.reduce(function(resultDeps, dir) {
        if (dir !== '.') {
          resultDeps[dir] = '*';
        }

        return resultDeps;
      }, {})
    };
  }

  var hasDep = pkg.dependencies && pkg.dependencies[dep];
  var hasDevDep = pkg.devDependencies && pkg.devDependencies[dep];

  // Bail early if we've already installed this dependency
  if (hasDep || hasDevDep) {
    return;
  }

  // Ignore linked modules
  try {
    var stats = fs.lstatSync(path.join(process.cwd(), "node_modules", dep));

    if (stats.isSymbolicLink()) {
      return;
    }
  } catch(e) {
    // Module exists in node_modules, but isn't symlinked
  }

  // Ignore NPM global modules (e.g. "path", "fs", etc.)
  try {
    var resolved = require.resolve(dep);

    // Global modules resolve to their name, not an actual path
    if (resolved.match(EXTERNAL)) {
      return;
    }
  } catch(e) {
    // Module is not resolveable
  }

  return dep;
}

module.exports.install = function install(dep, options) {
  if (!dep) {
    return;
  }

  var args = ["install"].concat([dep]).filter(Boolean);

  if (options) {
    for (option in options) {
      var arg = util.format("--%s", kebabCase(option));
      var value = options[option];

      if (value === false) {
        continue;
      }

      if (value === true) {
        args.push(arg);
      } else {
        args.push(util.format("%s='%s'", arg, value));
      }
    }
  }

  console.info("Installing `%s`...", dep);

  var output = spawn.sync("npm", args, { stdio: "inherit" });

  return output;
};
