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
            this.options.serverUrl = this.options.serverUrl+"/" ;
        }

        if(!this.options.dataEncoding){
            this.options.dataEncoding = "form" ;
        }
        this.ajaxInterceptors = [];

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
     * Init the client
     * 
     * @param {function} callback called on init done
     */
    VeloxServiceClient.prototype.init = function (callback) {
        initExtension.bind(this)(VeloxServiceClient.extensions.slice(), callback) ;
    } ;

    function initExtension(extensionsToInit, callback){
        if(extensionsToInit.length === 0){
            return callback() ;
        }
        var extension = extensionsToInit.shift() ;
        extension.init(this, function(err){
            if(err){ return callback(err); }
            initExtension.bind(this)(extensionsToInit, callback) ;
        }.bind(this)) ;
    }

    /**
     * Add an ajax interceptor, it will be called on ajax return
     * 
     * @example
     * api.addAjaxInterceptor(function(response, next){
     *          if(response.status === 401){
     *              //receive a 401, user should login
     *              ... redirect to login ...
     *              return;
     *          }
     *          next() ;//OK
     *      }) ;
     * 
     * @param {function} interceptor the interceptor, receive ({status : ..., responseText: ..., responseJson: ...}, next)
     */
    VeloxServiceClient.prototype.addAjaxInterceptor = function(interceptor){
        this.ajaxInterceptors.push(interceptor) ;
    } ;

    function runAjaxInterceptors(interceptors, response, callback){
        if(interceptors.length === 0){ return callback(response) ;}
        var interceptor = interceptors.shift() ;

        interceptor(response, function next(modifiedResponse){
            runAjaxInterceptors(interceptors, modifiedResponse||response, callback) ;
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
        method = method.toUpperCase() ;
        var xhr = new XMLHttpRequest();
        
        if(method === "GET" && data){
            var querystring = [] ;
            Object.keys(data).forEach(function(k){
                querystring.push(k+"="+encodeURIComponent(JSON.stringify(data[k]))) ;
            }) ;
            url = url+"?"+querystring.join("&") ;
        }
        
        xhr.open(method, this.options.serverUrl+url);
        xhr.withCredentials = true ;

        xhr.onreadystatechange = (function () {
            
            if (xhr.readyState === 4){
                var responseResult = xhr.responseText ;
                if(responseResult){
                    try{
                        responseResult = JSON.parse(responseResult) ;
                    }catch(e){}
                }

                var response = {status: xhr.status, responseText: xhr.responseText, response: responseResult, url: url} ;

                runAjaxInterceptors(this.ajaxInterceptors.slice(), response, function(modifiedResponse){

                    if(modifiedResponse.status >= 200 && modifiedResponse.status < 300) {
                        callback(null, modifiedResponse.response);
                    }  else if(xhr.status > 0){
                        callback(modifiedResponse.response||modifiedResponse.status);
                    }
                }) ;
            } 
        }).bind(this);

        xhr.onerror = (function (err) {
            callback(err) ;
        }).bind(this);


        if(this.options.xhrPrepare){
            this.options.xhrPrepare(xhr) ;
        }

        try{
            if(method === "POST" || method === "PUT"){
                if(dataEncoding === "json"){
                    xhr.setRequestHeader("Content-type", "application/json");
                    xhr.send(JSON.stringify(data));
                }else if(dataEncoding === "multipart"){
                    var formData = new FormData();
                    Object.keys(data).forEach(function (key) {
                        formData.append(key, data[key]);
                    }) ;
                    xhr.send(formData);
                }else{
                    var urlEncodedDataPairs = [];
                    Object.keys(data).forEach(function(k){
                        urlEncodedDataPairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(data[k]));
                    }) ;
                    var urlEncodedData = urlEncodedDataPairs.join('&').replace(/%20/g, '+');

                    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
                    xhr.send(urlEncodedData);
                }
            } else {
                xhr.send();
            }
        }catch(err){
            callback(err) ;
        }
        return xhr.upload || { addEventListener: function(){console.warn("upload listen is not supported on your browser...") ;} }
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
            if(!endPoint.endpoint){
                throw "Your endpoint definition miss endpoint option" ;
            }
            if(!endPoint.method){
                throw "Your endpoint "+endPoint.endpoint+" definition miss method option" ;
            }
            if(["GET", "POST", "PUT", "DELETE"].indexOf(endPoint.method.toUpperCase()) === -1){
                throw "Your endpoint "+endPoint.endpoint+" definition method option is incorrect (expecting: GET, POST, PUT or DELETE" ;
            }
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
        this._registerEndPointFunction(endpoint, this._createEndPointFunction(endpoint, method, dataEncoding, args)) ;
    } ;

    VeloxServiceClient.prototype._registerEndPointFunction = function(endpoint, fun){
        var splittedEndPoint = endpoint.split("/") ;
        var currentThis = this;
        for(var i=0; i< splittedEndPoint.length - 1; i++){
            if(!this[splittedEndPoint[i]]){
                this[splittedEndPoint[i]] = {};
            }
            currentThis = this[splittedEndPoint[i]] ;
        }
        currentThis[splittedEndPoint[splittedEndPoint.length-1]] = fun.bind(this) ;
    } ;

    VeloxServiceClient.prototype._createEndPointFunction = function(endpoint, method, dataEncoding, args){
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

        args = args.map(function(a){
            if(typeof(a) === "string"){
                return { name : a } ;
            }
            return a;
        });

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

        return function(){
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
            this.ajax(endpoint, method, data, dataEncoding, callback) ;
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