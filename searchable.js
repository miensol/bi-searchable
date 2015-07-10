(function (angular) {
    'use strict';
    //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind#Polyfill
    var fnPrototype = Function.prototype;
    if (!fnPrototype.bind) {
        fnPrototype.bind = function (oThis) {
            if (typeof this !== 'function') {
                // closest thing possible to the ECMAScript 5
                // internal IsCallable function
                throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
            }

            var aArgs = Array.prototype.slice.call(arguments, 1),
                fToBind = this,
                Noop = function () {
                },
                fBound = function () {
                    return fToBind.apply(this instanceof Noop && oThis ? this : oThis,
                        aArgs.concat(Array.prototype.slice.call(arguments)));
                };

            Noop.prototype = this.prototype;
            fBound.prototype = new Noop();

            return fBound;
        };
    }

    var module = angular.module('bi-searchable', []),
        logError = function () {
          console.error(arguments);
        },
        arrayRemove = function (array, element) {
            var index;
            while ((index = array.indexOf(element)) != -1) {
                array.splice(index, 1);
            }
        },
        toString = Object.prototype.toString,
        isArray = function (value) {
          return value && typeof value == 'object' && typeof value.length == 'number' &&
        toString.call(value) == arrayClass || false
        },
        isEmpty = function (val) {
            return !val || !val.length
        };

    module.directive('biSearchableInput', function () {
        return {
            restrict: 'E',
            replace: true,
            scope: {
                ngModel: '=',
                placeholder: '@'
            },
            templateUrl: 'biSearchableInput.html'
        };
    }).run(['$templateCache', function ($templateCache) {
        $templateCache.put('biSearchableInput.html', '<div class="input-group bi-searchable-input">' +
            '<span class="input-group-addon">' +
            '<i class="glyphicon glyphicon-search"></i>' +
            '</span>' +
            ' <input ng-model="ngModel" type="search" class="form-control" placeholder="{{placeholder}}">' +
            '<span class="input-group-addon" ng-disabled="!ngModel.length" type="button" ng-click="ngModel = \'\'">' +
            '<i class="glyphicon glyphicon-remove-sign"></i>' +
            '</span>' +
            '</div>')
    }]);


    module.directive('biSearchableContainer', function () {
        return {
            restrict: 'E',
            replace: true,
            scope: {
                filterByTerm: '='
            },
            transclude: true,
            templateUrl: 'biSearchableContainer.html',
            controller: ['$scope', '$timeout', function biSearchableContainerCtrl($scope, $timeout) {
                var id = 0,
                    rootNodes = [],
                    nodes = {},
                    tree = {},
                    nextId = function () {
                        return id += 1;
                    },
                    addToNodes = function (node) {
                        if (!angular.isDefined(node.treeId)) {
                            node.treeId = nextId();
                            nodes[node.treeId] = node;
                        }
                    },
                    appendToTree = function (child, parent) {
                        addToNodes(child);
                        if (parent) {
                            addToNodes(parent);
                            tree[parent.treeId] = tree[parent.treeId] || [];
                            tree[parent.treeId].push(child);
                        } else {
                            rootNodes.push(child);
                        }
                    },
                    walkTree = function (parentId, callback, depth) {
                        depth = depth || 0;
                        var node = nodes[parentId];

                        var children = tree[parentId];
                        if (children) {
                            children.forEach(function (child) {
                                walkTree(child.treeId, callback, depth + 1);
                            });
                        }
                        if (node) {
                            callback(node, children || []);
                        }
                    },
                    removeFromTree = function (child) {
                        walkTree(child.treeId, function (node) {
                            delete nodes[node.treeId];
                            delete tree[node.treeId];
                        });
                        arrayRemove(rootNodes, child);
                    },
                    debounce = function (func, wait, immediate) {
                        // Copied from https://github.com/shahata/angular-debounce
                        var timeout, args, context, result;

                        function debounce() {
                            /* jshint validthis:true */
                            context = this;
                            args = arguments;
                            var later = function () {
                                timeout = null;
                                if (!immediate) {
                                    result = func.apply(context, args);
                                }
                            };
                            var callNow = immediate && !timeout;
                            if (timeout) {
                                $timeout.cancel(timeout);
                            }
                            timeout = $timeout(later, wait);
                            if (callNow) {
                                result = func.apply(context, args);
                            }
                            return result;
                        }

                        debounce.cancel = function () {
                            $timeout.cancel(timeout);
                            timeout = null;
                        };
                        return debounce;
                    },
                    isNodeVisible = function (node) {
                        return node.visible;
                    },
                    executeFilterBy = function (newValue) {
                        rootNodes.forEach(function (rootNode) {
                            walkTree(rootNode.treeId, function (node, children) {
                                node.filterByTerm(newValue);

                                if (children.some(isNodeVisible)) {
                                    node.visible = true;
                                }

                                node.visibleAfterSearch = node.visibleAfterSearch || node.visible;
                            });
                        });
                    },
                    executeFilterByDebounced = debounce(function (newValue) {
                        $scope.$apply(function () {
                            executeFilterBy(newValue)
                        });
                    }.bind(this), 300);

                this.registerContent = function (child, parent) {
                    appendToTree(child, parent);
                    if ($scope.filterByTerm) {
                        executeFilterByDebounced($scope.filterByTerm);
                    }
                };

                this.removeContent = removeFromTree;

                $scope.$watch('filterByTerm', function (newValue, oldValue) {
                    if (newValue !== oldValue) {
                        executeFilterByDebounced(newValue);
                    }
                }.bind(this));
            }]
        };
    }).run(function ($templateCache) {
        $templateCache.put('biSearchableContainer.html', '<div class="local-search-filter" ng-transclude=""></div>')
    });

    module.directive('biSearchableElement', function ($parse) {
        return {
            restrict: 'A',
            require: ['^?biSearchableContainer', 'biSearchableElement', '?^^biSearchableElement'],
            link: function ($scope, $element, $attrs, controllers) {
                var containerCtrl = controllers[0];
                if (!containerCtrl) {
                    logError('searchable container not found!!', $element);
                    return;
                }
                var searchableElementModel = $attrs.biSearchableElement;
                if (!searchableElementModel) {
                    logError('searchable element attribute not defined', $element, $attrs);
                    return;
                }
                var elementCtrl = controllers[1];
                var parentCtrl = controllers[2];

                var contentGetter = $parse(searchableElementModel);
                $scope.$watch(contentGetter, function (newValue) {
                    if (newValue) {
                        if (!isArray(newValue)) {
                            newValue = [newValue];
                        }
                    } else {
                        newValue = [];
                    }
                    elementCtrl.searchContent = newValue.map(function (item) {
                        return item.toLowerCase();
                    });
                });

                if (containerCtrl) {
                    containerCtrl.registerContent(elementCtrl, parentCtrl);
                    $scope.$on('$destroy', function () {
                        containerCtrl.removeContent(elementCtrl);
                    });
                }

                $scope.$watch(function () {
                    return elementCtrl.visible;
                }, function (newValue, oldValue) {
                    if (newValue !== oldValue) {
                        $element.toggleClass('ng-hide', !newValue);
                    }
                });
                Object.defineProperty($scope, '$searchable', {
                    get: function () {
                        return elementCtrl;
                    },
                    readonly: true,
                    configurable: false,
                    enumerable: false
                });
            },
            controller: function searchElementCtrl() {
                this.visible = true;
                this.searchContent = null;
                this.visibleAfterSearch = false;
                this.filterByTerm = function (term) {
                    term = !term ? '' : term.replace(/\s\s/g, ' ')
                        .replace(/^\s*/, '')
                        .replace(/\s*$/, '')
                        .toLowerCase();

                    if (isEmpty(term) || isEmpty(this.searchContent)) {
                        this.visible = true;
                    } else {
                        this.visible = this.searchContent.some(function (content) {
                            return content.indexOf(term) !== -1;
                        });
                    }
                    this.visibleAfterSearch = this.visibleAfterSearch || this.visible;
                };
            }
        };
    });


}(angular));
