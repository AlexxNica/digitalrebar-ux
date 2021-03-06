/*
  Copyright 2017, RackN
  Bios Settings Controller
*/
(function () {
  angular.module('app').controller('BiosSettingsCtrl', [
    '$mdMedia', '$mdDialog', '$scope', '$http', 'debounce', '$timeout', 'api',
    function ($mdMedia, $mdDialog, $scope, $http, debounce, $timeout, api) {
      $scope.$emit('title', 'BIOS Settings'); // shows up on the top toolbar

      $scope.expand = [];
      $scope.dirty = false;
      $scope.settings = [];
      $scope.role = -1;
      $scope.deployment_role = -1;
      $scope.id = -1;

      $scope.loadSettings = function () {
        api.get_id('/api/v2/roles/bios-discover')
        .then(function (resp) {
          $scope.role = resp.data.id;
          api('/api/v2/deployments/system/deployment_roles')
          .then(function (resp) {
            let deploymentRoles = resp.data;
            for (let id in deploymentRoles) {
              if (deploymentRoles[id].role_id === $scope.role) {
                $scope.deployment_role = deploymentRoles[id].id;
                break;
              }
            }
            api('/api/v2/deployment_roles/' + $scope.deployment_role +
              '/attribs/bios-set-mapping')
            .then(function (resp) {
              let obj = resp.data;
              $scope.dirty = false;
              $scope.id = obj.id;
              $scope.settings = [];
              obj.value.forEach(function(tt) {
                tt.configs.forEach(function(c) {
                  let newobj = {};

                  newobj.role = tt.role;
                  for (let i in $scope._roles) {
                    if ($scope._roles[i].name === tt.role) {
                      newobj.role_id = $scope._roles[i].id;
                      break;
                    }
                  }
                  newobj.name = c.name;
                  newobj.parent = c.parent;
                  newobj.match = [];
                  newobj.values = [];

                  Object.keys(tt.match).forEach(function(key) {
                    let om = { id: key};
                    if (typeof tt.match[key] === 'string') {
                      om.pattern = tt.match[key];
                      om.op = 'exact';
                    } else {
                      om.pattern = tt.match[key].match;
                      om.op = tt.match[key].op;
                    }
                    newobj.match.push(om);
                  });
                  Object.keys(c.settings).forEach(function(key) {
                    let ov = {id: key, value: c.settings[key]};
                    newobj.values.push(ov);
                  });
                  $scope.settings.push(newobj);
                });
              });
            }, function (err) {
              api.toast('Error Bios Setting Data', 'bios_setting', err.data);
            });
          });
        });
      };

      // called when field is changed
      this.dirtyData = function() {
        $scope.dirty = true;
      };

      // called when a deployment is clicked
      this.toggleExpand = function (id) {
        $scope.expand[id] = !$scope.expand[id];
      };

      $scope.removeValue = function(index, type, id) {
        for (let i in $scope.settings[index][type]) {
          if ($scope.settings[index][type][i].id === id) {
            $scope.settings[index][type].splice(i,1);
            api.toast('Removed ' + type + ' ' + id, type, index);
            $scope.dirty = true;
            break;
          }
        }
      };

      $scope.addValue = function(index, type) {
        let o = {id: 'not set', value: 'undefined', op: 'exact'};
        $scope.settings[index][type].push(o);
        $scope.dirty = true;
      };

      $scope.createHardwareSectionPrompt = function(ev, ind, parent) {
        // Appending dialog to document.body to cover sidenav in docs app
        let confirm = $mdDialog.prompt()
          .title('Creating Section for ' + $scope.settings[ind].name)
          .textContent('Section Name:')
          .placeholder('default')
          .ariaLabel('Section')
          .targetEvent(ev)
          .ok('Add')
          .cancel('Cancel');

        $mdDialog.show(confirm).then(function(result) {
          let o = {
            role: $scope.settings[ind].role,
            name: result,
            parent: parent,
            match: [],
            values: []
          };
          $scope.settings.push(o);
        }, function() {
          console.log('did not create');
        });
      };

      $scope.createHardwareClassPrompt = function(ev) {
        // Appending dialog to document.body to cover sidenav in docs app
        let confirm = $mdDialog.prompt()
          .title('Creating Hardware Class:')
          .textContent('Role:Group Name.')
          .placeholder('role:default')
          .ariaLabel('Role:Class')
          .targetEvent(ev)
          .ok('Add')
          .cancel('Cancel');
        $mdDialog.show(confirm).then(function(result) {
          let res = result.split(':');
          let o = {
            role: res[0],
            name: (res[1] || 'default'),
            match: [],
            values: []
          };
          $scope.settings.push(o);
        }, function() {
          console.log('did not create');
        });
      };

      // called when a deployment is clicked
      $scope.saveSetting = function () {
        let roles = {};
        $scope.settings.forEach(function(block) {
          if (!roles[block.role])
            roles[block.role] = {role: block.role, configs: [], match: {}};
          let c = { name:block.name, settings:{} };
          if (block.parent)
            c.parent = block.parent;
          block.values.forEach(function(s) {
            c.settings[s.id] = s.value;
          });
          roles[block.role].configs.push(c);
          if (block.name === 'default') {
            block.match.forEach(function(m) {
              if (m.op === 'exact') {
                roles[block.role].match[m.id] = m.pattern;
              } else {
                roles[block.role].match[m.id] = {
                  op: m.op,
                  match: m.pattern,
                  __sm_leaf: 'true,'
                };
              }
            });
          }
        });
        let data = [];
        for (let r in roles) {
          data.push(roles[r]);
        }
        let obj = { value: data };
        obj['deployment_role_id'] = $scope.deployment_role;
        api('/api/v2/deployment_roles/' + $scope.deployment_role +
          '/propose', {
            method: 'PUT'
          })
        .then(function() {
          api('/api/v2/attribs/' + $scope.id, {
            method: 'PUT',
            data: obj
          })
          .then(function() {
            api.toast('Updated Attrib!');
            api('/api/v2/deployment_roles/' + $scope.deployment_role +
              '/commit', {
                method: 'PUT'
              })
            .then(function() {
              api.toast('Committed!');
              $scope.dirty = false;
            });
          }, function (err) {
            api.toast('Error updating values', 'attribs', err.data);
          });
        });
      };

      // called when a deployment is clicked
      $scope.deleteSetting = function (event, id) {
        $scope.dirty = true;
        delete $scope.settings[id];
      };

      $scope.loadSettings();
    }
  ]);
})();
