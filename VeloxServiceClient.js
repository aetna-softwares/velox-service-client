; (function (global, factory) {
        typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
        typeof define === 'function' && define.amd ? define(factory) :
        global.VeloxServiceClient = factory() ;
}(this, (function () { 'use strict';


    /**
     * @typedef VeloxServiceClientOptions
     * @type {object}
     * @property {string} serverUrl Server end point URL
     * @property {function} xhrPrepare function that receive the XHR object to customize it if needed
     * @property {string} [dataEncoding] default data encoding for ajax calls : form for formdata, json for json payload (default : form)
     */

    /**
     * The Velox database client
     * 
     * @constructor
     * 
     * @param {VeloxServiceClientOptions} options database client options
     */
    function VeloxServiceClient(options) {
        if(!options || typeof(options) !== "object"){
            throw "VeloxDatabaseClient missing options" ;
        }
        this.options = JSON.parse(JSON.stringify(options))  ;
        if(!this.options.serverUrl){
            throw "VeloxDatabaseClient missing option serverUrl" ;
        }

        if(this.options.serverUrl[this.options.serverUrl.length-1] !== "/"){
            //add trailing slash
            this.options.serverUrl+"/" ;
        }

        if(!this.options.dataEncoding){
            this.options.dataEncoding = "form" ;
        }

        var self = this ;
        VeloxServiceClient.extensions.forEach(function(extension){
            if(extension.extendsObj){
                Object.keys(extension.extendsObj).forEach(function (key) {
                        self[key] = extension.extendsObj[key];
                });
            }
        }) ;
    }

    /**
     * Perform ajax call
     * 
     * @param {string} url the url to call
     * @param {string} method the HTTP method
     * @param {object} data the parameters to send
     * @param {string} [dataEncoding] data encoding for ajax calls : form for formdata, json for json payload (default : from options)
     * @param {function(Error, *)} callback called with error or result
     */
    VeloxServiceClient.prototype.ajax = function (url, method, data, dataEncoding, callback) {
        if(typeof(dataEncoding) === "function"){
            callback = dataEncoding;
            dataEncoding = this.options.dataEncoding ;
        }
        var xhr = new XMLHttpRequest();
        if(method === "GET" && data){
            var querystring = [] ;
            Object.keys(data).forEach(function(k){
                querystring.push(k+"="+encodeURIComponent(JSON.stringify(data[k]))) ;
            }) ;
            url = url+"?"+querystring.join("&") ;
        }
        
        xhr.open(method, url);
        xhr.setRequestHeader("Content-type", "application/json");

        xhr.onreadystatechange = (function () {
            
            if (xhr.readyState === 4){
                var responseResult = xhr.responseText ;
                if(responseResult){
                    try{
                        responseResult = JSON.parse(responseResult) ;
                    }catch(e){}
                }
                if(xhr.status >= 200 && xhr.status < 300) {
                    callback(null, responseResult);
                } else {
                    callback(responseResult||xhr.status);
                }
            } 
        }).bind(this);
        if(this.options.xhrPrepare){
            this.options.xhrPrepare(xhr) ;
        }
        if(method === "POST" || method === "PUT"){
            xhr.setRequestHeader("Content-type", "application/json");
            if(dataEncoding === "json"){
                xhr.send(JSON.stringify(data));
            }else{
                var formData = new FormData();
                Object.keys(data).forEach(function(k){
                    formData.append(k, data[k]) ;
                }) ;
                xhr.send(formData);
            }
            
        } else {
            xhr.send();
        }
    } ;


    /**
     * @typedef VeloxServiceClientEndPointDefinition
     * @type {object}
     * @property {string} endpoint the serveur end point without heading slash (ex: "myservercall", "foo/create")
     * @property {string} method the HTTP method to use (POST, PUT, GET, DELETE)
     * @property {string} [dataEncoding] data encoding for ajax calls : form for formdata, json for json payload (default : from options)
     * @property {Array} [args] the arguments definition
     */

    /**
     * Add many end points to this service client API
     * 
     * @example
     * api.addEndPoints([
     *      {endpoint: "foo", method: "POST"}, //will be accessible as api.foo(callback) or api.foo({..data..}, callback)
     *      {endpoint: "bar/create", method: "PUT"}, //will be accessible as api.bar.create({...}, callback)
     *      {endpoint: "some/complex/entry", method: "POST", args: [ {name: "foo"}, {name: "bar", optional: true} ]}
     *              //will be accessible as api.some.complex.entry(myFoo, myBar, callback) or api.some.complex.entry(myFoo, callback)
     *              //but api.some.complex.entry(callback) will throw an exception because missing non optional argument
     * ]);
     * 
     * @param {VeloxServiceClientEndPointDefinition[]} endPoints the end points definitions
     */
    VeloxServiceClient.prototype.addEndPoints = function(endPoints){
        endPoints.forEach(function(endPoint){
            this.addEndPoint(endPoint.endpoint, endPoint.method, endPoint.dataEncoding, endPoint.args) ;
        }.bind(this)) ;
    } ;

    /**
     * Add an end point function to this service client API
     * 
     * @example
     * api.addEndPoint("foo", "POST"); //will be accessible as api.foo(callback) or api.foo({..data..}, callback)
     * api.addEndPoint("bar/create", "PUT"); //will be accessible as api.bar.create({...}, callback)
     * api.addEndPoint("some/complex/entry", "POST", 
     *        [ {name: "foo"}, {name: "bar", optional: true} ])
     * //will be accessible as api.some.complex.entry(myFoo, myBar, callback) or api.some.complex.entry(myFoo, callback)
     * //but api.some.complex.entry(callback) will throw an exception because missing non optional argument
     * 
     * @param {string} endpoint the serveur end point without heading slash (ex: "myservercall", "foo/create")
     * @param {string} method the HTTP method to use (POST, PUT, GET, DELETE)
     * @param {string} [dataEncoding] data encoding for ajax calls : form for formdata, json for json payload (default : from options)
     * @param {Array} [args] the arguments definition
     */
    VeloxServiceClient.prototype.addEndPoint = function (endpoint, method, dataEncoding, args) {
        if(Array.isArray(dataEncoding)){
            args = dataEncoding ;
            dataEncoding = null;
        }
        if(!args){
            //if no args defined, accept 1 optional argument
            args = [
                { optional: true }
            ] ;
        }

        var hasOptional = false;
        args.forEach(function(arg, i){
            if(!arg.name && i>0){
                throw "Error in endpoint definition, if you don't give name to one argument, you can't have many arguments" ;
            }
            if(arg.optional){
                hasOptional ;
            }
            if(!arg.optional && hasOptional){
                throw "Error in endpoint definition, only the last arguments can be optionals" ;
            }
        }) ;

        var splittedEndPoint = endpoint.split("/") ;
        var currentThis = this;
        for(var i=0; i< splittedEndPoint.length - 1; i++){
            if(!this[splittedEndPoint[i]]){
                this[splittedEndPoint[i]] = {};
            }
            currentThis = this[splittedEndPoint[i]] ;
        }
        currentThis[splittedEndPoint[splittedEndPoint.length-1]] = function(){
            var receivedArgs = Array.prototype.slice.call(arguments) ;
            var callback = receivedArgs[receivedArgs.length-1] ;
            if(!callback){
                throw "You must give a callback to service endpoint call ("+endpoint+")" ;
            }
            var data = {} ;
            args.forEach(function(arg, i){
                if(i < receivedArgs.length-1){
                    var value = receivedArgs[i] ;
                    if(arg.name){
                        data[arg.name] = value ;
                    }else{
                        data = value ;
                    }
                } else {
                    if(!arg.optional){
                        throw "Missing argument "+arg.name+" to service endpoint call ("+endpoint+")" ;
                    }
                }
            }) ;
            this.ajax(this.options.serverUrl+endpoint, method, data, dataEncoding, callback) ;
        }.bind(this) ;
    } ;

    /**
     * contains extensions
     */
    VeloxServiceClient.extensions = [];

    /**
     * Register extensions
     * 
     * extension object should have : 
     *  name : the name of the extension
     *  extendsObj : object containing function to add to VeloxServiceClient instance
     *  extendsProto : object containing function to add to VeloxServiceClient prototype
     *  extendsGlobal : object containing function to add to VeloxServiceClient global object
     * 
     * @param {object} extension - The extension to register
     */
    VeloxServiceClient.registerExtension = function (extension) {
            VeloxServiceClient.extensions.push(extension);

            if (extension.extendsProto) {
                Object.keys(extension.extendsProto).forEach(function (key) {
                        VeloxServiceClient.prototype[key] = extension.extendsProto[key];
                });
            }
            if (extension.extendsGlobal) {
                Object.keys(extension.extendsGlobal).forEach(function (key) {
                        VeloxServiceClient[key] = extension.extendsGlobal[key];
                });
            }
    };


    return VeloxServiceClient;
})));