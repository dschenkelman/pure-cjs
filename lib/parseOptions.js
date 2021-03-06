var pathUtils = require('./pathUtils'),
	es = require('event-stream'),
	b = require('ast-types').builders,
	Promise = require('./promise'),
	fs = require('fs'),
	esprima = require('esprima');

function toValue(value) {
	return value instanceof Function ? value.apply(null, Array.prototype.slice.call(arguments, 1)) : value;
}

module.exports = function (inOptions) {
	var options = {
		defaultExt: inOptions.defaultExt || 'js',
		moduleDir: inOptions.moduleDir || 'node_modules',
		input: pathUtils.normalizePath(toValue(inOptions.input))
	};

	options.output = pathUtils.normalizePath(toValue(
		inOptions.output || function (input) {
			return pathUtils.forceExt(input, 'out.js');
		},
		options.input
	));

	if (inOptions.map) {
		options.map = pathUtils.normalizePath(toValue(
			inOptions.map !== true ? inOptions.map : function (input, output) {
				return output + '.map';
			},
			options.input,
			options.output
		));
	}

	options.exports = toValue(inOptions.exports, options.input, options.output);

	var transforms = inOptions.transform;
	transforms = transforms ? (transforms instanceof Array ? transforms : [transforms]) : [];

	options.comments = !!inOptions.comments;
	options.dryRun = !!inOptions.dryRun;

	options.deps = [];

	for (var name in inOptions.external) {
		var inDep = inOptions.external[name];
		if (inDep === true) {
			inDep = {};
		}
		if (inDep === false) {
			inDep = {global: false, amd: false};
		}
		var globalName = inDep.global || name.replace(/\W/g, '');
		var dep = {
			name: inDep.name !== undefined ? inDep.name : name,
			global: inDep.global !== undefined ? inDep.global : globalName,
			amd: inDep.amd !== undefined ? inDep.amd : name
		};
		dep.id = b.identifier(inDep.id || ('__external_' + globalName));
		options.deps.push(dep);
	}

	var getFileStream = inOptions.getFileStream || function (path) {
		return fs.createReadStream(path, {encoding: 'utf-8'});
	};

	var getFileContents = inOptions.getFileContents || function (path) {
		var pipeline = transforms.reduce(function (stream, transform) {
			return stream.pipe(transform(path));
		}, getFileStream(path));

		var defer = Promise.defer();

		pipeline.pipe(es.wait(function (err, js) {
			err ? defer.reject(err) : defer.fulfill(js);
		}));

		return defer.promise;
	};

	options.getFileAST = inOptions.getFileAST || function (parseOpts) {
		return getFileContents(parseOpts.source).then(function (js) {
			if (pathUtils.ext(parseOpts.source) === 'json') {
				js = 'module.exports = ' + js;
			}
			return esprima.parse(js, parseOpts);
		});
	};

	return options;
};