var app = angular.module('APSAdmin', []);

app.controller('AdminCtrl', function ($scope, $http, $timeout, $q) {

  // ─── Session ─────────────────────────────────────────────────────────────
  $scope.isLoggedIn = localStorage.getItem('atlas_admin') === '1';
  $scope.loginUser  = '';
  $scope.loginPass  = '';
  $scope.loginError = '';
  $scope.today      = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

  $scope.doLogin = function () {
    // Read directly from DOM to bypass AngularJS autofill binding issues
    var user = (document.getElementById('loginUserInput').value || '').trim();
    var pass = (document.getElementById('loginPassInput').value || '').trim();
    if (user === 'admin' && pass === '123') {
      localStorage.setItem('atlas_admin', '1');
      $scope.isLoggedIn = true;
      $scope.loginError = '';
      loadAll();
    } else {
      $scope.loginError = 'Invalid username or password';
    }
  };

  $scope.logout = function () {
    localStorage.removeItem('atlas_admin');
    $scope.isLoggedIn = false;
    $scope.loginUser  = '';
    $scope.loginPass  = '';
  };

  // ─── Pages ───────────────────────────────────────────────────────────────
  $scope.adminPage    = 1;   // 1 = Item Manage, 2 = Report
  $scope.manageTab    = 1;   // 1=List, 2=AddEdit, 3=Barcode, 4=Inventory
  $scope.inventoryTab = 1;   // 1=Add Stock, 2=Stock Additions Log, 3=Stock Levels
  $scope.reportTab    = 1;   // 1=Bills, 2=ItemsCount, 3=Stock Levels, 4=Stock Additions

  // ─── API helper ───────────────────────────────────────────────────────────
  function sp(sysId, params) {
    return $http.post('/api/Master/sp', { SysID: sysId, Params: params || null });
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  $scope.toast = { show: false, message: '' };
  $scope.showToast = function (msg) {
    $scope.toast = { show: true, message: msg };
    $timeout(function () { $scope.toast.show = false; }, 2500);
  };

  // ─── Confirm ─────────────────────────────────────────────────────────────
  $scope.confirmData = { show: false };
  $scope.showConfirm = function (title, message, cb) {
    $scope.confirmData = {
      show: true, title: title, message: message,
      onConfirm: function () { $scope.confirmData.show = false; cb(); }
    };
  };

  // ─── Items ───────────────────────────────────────────────────────────────
  $scope.items           = [];
  $scope.manageSearch    = '';
  $scope.manageCatFilter = '';
  $scope.formItem        = {};
  $scope.editMode        = false;
  $scope.formError       = '';
  $scope.imgFile         = null;
  $scope.imgPreview      = null;

  function loadItems() {
    sp('sp_prods').then(function (res) {
      $scope.items = Array.isArray(res.data) ? res.data : [];
    }).catch(function () {
      $scope.showToast('Failed to load products');
    });
  }

  // File input bridge for image upload
  window._aAdminImg = function (input) {
    var file = input.files[0];
    if (!file) return;
    $scope.$apply(function () {
      $scope.imgFile = file;
      var reader = new FileReader();
      reader.onload = function (e) {
        $scope.$apply(function () { $scope.imgPreview = e.target.result; });
      };
      reader.readAsDataURL(file);
    });
  };

  function resetImage() {
    $scope.imgFile    = null;
    $scope.imgPreview = null;
    var inp = document.getElementById('adminImgInput');
    if (inp) inp.value = '';
  }

  $scope.clearImage = function () { resetImage(); };

  $scope.manageFilter = function () {
    return function (item) {
      var q   = ($scope.manageSearch || '').toLowerCase().trim();
      var cat = $scope.manageCatFilter || '';
      return (!cat || item.category === cat) &&
             (!q   || item.code.toLowerCase().indexOf(q) !== -1 ||
                      item.description.toLowerCase().indexOf(q) !== -1);
    };
  };

  $scope.openAddItem = function () {
    $scope.editMode  = false;
    $scope.formItem  = { code:'', description:'', category:'', mrp:0, price:0 };
    $scope.formError = '';
    resetImage();
  };

  $scope.editItem = function (item) {
    $scope.editMode  = true;
    $scope.formItem  = angular.copy(item);
    $scope.formError = '';
    $scope.manageTab = 2;
    resetImage();
  };

  $scope.saveItem = function () {
    $scope.formError = '';
    var f = $scope.formItem;
    if (!f.code || !f.code.trim())              { $scope.formError = 'Item code is required.';  return; }
    if (!f.description || !f.description.trim()) { $scope.formError = 'Description is required.'; return; }
    if (!f.category)                             { $scope.formError = 'Category is required.';   return; }

    f.code  = f.code.trim().toUpperCase();
    f.mrp   = parseFloat(f.mrp)   || 0;
    f.price = parseFloat(f.price) || 0;

    sp('sp_save_prod', { code: f.code, desc: f.description, cat: f.category, mrp: f.mrp, price: f.price })
      .then(function () {
        if ($scope.imgFile) {
          var fd = new FormData();
          fd.append('code', f.code);
          fd.append('file', $scope.imgFile);
          $http.post('/api/Master/upload', fd, { headers: { 'Content-Type': undefined } })
            .then(function () { $scope.showToast('Image saved for ' + f.code); })
            .catch(function () { $scope.showToast('Item saved but image upload failed'); });
        }
        resetImage();
        loadItems();
        $scope.showToast(($scope.editMode ? 'Updated: ' : 'Added: ') + f.code);
        $scope.manageTab = 1;
      })
      .catch(function () { $scope.formError = 'Save failed — check connection.'; });
  };

  $scope.deleteItem = function (item) {
    $scope.showConfirm('Delete Item', 'Delete "' + item.description + '"?', function () {
      sp('sp_del_prod', { code: item.code }).then(function () {
        loadItems();
        $scope.showToast('Deleted: ' + item.code);
      });
    });
  };

  $scope.cancelForm = function () { $scope.manageTab = 1; $scope.formError = ''; };

  // ─── Barcode ──────────────────────────────────────────────────────────────
  $scope.barcodes    = [];
  $scope.barcodeForm = { barcode:'', code:'', foundItem:null, notFound:false };

  function loadBarcodes() {
    sp('sp_get_bc').then(function (res) {
      $scope.barcodes = Array.isArray(res.data) ? res.data : [];
    });
  }

  $scope.lookupBarcodeItem = function () {
    var code = ($scope.barcodeForm.code || '').trim().toUpperCase();
    $scope.barcodeForm.foundItem = null;
    $scope.barcodeForm.notFound  = false;
    if (!code) return;
    var found = $scope.items.find(function (i) { return i.code === code; });
    found ? ($scope.barcodeForm.foundItem = found) : ($scope.barcodeForm.notFound = true);
  };

  $scope.saveBarcode = function () {
    var bc    = ($scope.barcodeForm.barcode || '').trim();
    var found = $scope.barcodeForm.foundItem;
    if (!bc || !found) return;
    sp('sp_save_bc', { barcode: bc, code: found.code }).then(function () {
      loadBarcodes();
      $scope.barcodeForm = { barcode:'', code:'', foundItem:null, notFound:false };
      $scope.showToast('Barcode mapped successfully');
    });
  };

  $scope.deleteBarcode = function (b) {
    $scope.showConfirm('Remove Barcode', 'Remove mapping for barcode ' + b.barcode + '?', function () {
      sp('sp_del_bc', { barcode: b.barcode }).then(function () {
        loadBarcodes();
        $scope.showToast('Barcode removed');
      });
    });
  };

  // ─── Inventory / Stock ────────────────────────────────────────────────────
  $scope.stockList    = [];
  $scope.stockLoading = false;

  function freshStockForm() {
    return { searchText:'', qty:1, note:'', foundItem:null, suggestions:[], showDropdown:false, error:'' };
  }
  $scope.stockForm = freshStockForm();

  function loadStock() {
    $scope.stockLoading = true;
    sp('sp_get_stock').then(function (res) {
      $scope.stockList = Array.isArray(res.data) ? res.data : [];
    }).catch(function () {
      $scope.showToast('Failed to load stock');
    }).finally(function () {
      $scope.stockLoading = false;
    });
  }

  $scope.reloadStock = function () { loadStock(); };

  $scope.getStockQty = function (code) {
    var s = $scope.stockList.find(function (x) { return x.code === code; });
    return s && s.stock !== null && s.stock !== undefined ? s.stock : '—';
  };

  // Autocomplete: prioritise starts-with matches, max 6 results
  $scope.filterStockItems = function () {
    var q = ($scope.stockForm.searchText || '').toLowerCase().trim();
    if (!q || $scope.stockForm.foundItem) { $scope.stockForm.suggestions = []; return; }
    var starts = [], contains = [];
    $scope.items.forEach(function (i) {
      var c = i.code.toLowerCase(), d = i.description.toLowerCase();
      if (c.indexOf(q) === 0 || d.indexOf(q) === 0) starts.push(i);
      else if (c.indexOf(q) !== -1 || d.indexOf(q) !== -1) contains.push(i);
    });
    $scope.stockForm.suggestions = starts.concat(contains).slice(0, 6);
  };

  // Select from dropdown (ng-mousedown fires before ng-blur so dropdown stays open long enough)
  $scope.selectStockItem = function (item) {
    $scope.stockForm.foundItem    = item;
    $scope.stockForm.searchText   = item.description + ' (' + item.code + ')';
    $scope.stockForm.suggestions  = [];
    $scope.stockForm.showDropdown = false;
    $scope.stockForm.error        = '';
  };

  $scope.clearStockItem = function () {
    $scope.stockForm.foundItem    = null;
    $scope.stockForm.searchText   = '';
    $scope.stockForm.suggestions  = [];
    $scope.stockForm.showDropdown = false;
    $scope.stockForm.error        = '';
  };

  // Close dropdown after blur (delay so ng-mousedown on items fires first)
  $scope.blurStockSearch = function () {
    $timeout(function () { $scope.stockForm.showDropdown = false; }, 180);
  };

  $scope.addStock = function () {
    $scope.stockForm.error = '';
    var found = $scope.stockForm.foundItem;
    var qty   = parseInt($scope.stockForm.qty) || 0;
    var note  = ($scope.stockForm.note || '').trim();
    if (!found)  { $scope.stockForm.error = 'Please select a product.'; return; }
    if (qty <= 0) { $scope.stockForm.error = 'Quantity must be greater than 0.'; return; }
    if (!note)   { $scope.stockForm.error = 'Note is required.'; return; }

    sp('sp_add_stock', { code: found.code, qty: qty, note: note })
      .then(function () {
        loadStock();
        loadStockLog();
        $scope.stockForm = freshStockForm();
        $scope.showToast('Stock updated: ' + found.code);
      })
      .catch(function () { $scope.stockForm.error = 'Failed to update stock — check connection.'; });
  };

  // Stock summary helpers
  $scope.countOutOfStock = function () {
    return $scope.stockList.filter(function (s) { return s.stock !== null && s.stock !== undefined && s.stock <= 0; }).length;
  };
  $scope.countLowStock = function () {
    return $scope.stockList.filter(function (s) { return s.stock !== null && s.stock !== undefined && s.stock > 0 && s.stock <= 10; }).length;
  };
  $scope.countTracked = function () {
    return $scope.stockList.filter(function (s) { return s.stock !== null && s.stock !== undefined; }).length;
  };

  // ─── Stock Additions Log ─────────────────────────────────────────────────
  $scope.stockLog        = [];
  $scope.stockLogLoading = false;

  function loadStockLog() {
    $scope.stockLogLoading = true;
    sp('sp_get_stock_log').then(function (res) {
      $scope.stockLog = Array.isArray(res.data) ? res.data : [];
    }).catch(function () {
      $scope.showToast('Failed to load stock log');
    }).finally(function () {
      $scope.stockLogLoading = false;
    });
  }

  $scope.reloadStockLog = function () { loadStockLog(); };

  // ─── Report: Bills ────────────────────────────────────────────────────────
  $scope.bills         = [];
  $scope.reportLoading = false;

  function fmtDate(d) {
    var mm = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  $scope.reportFrom = new Date();
  $scope.reportTo   = new Date();

  $scope.setToday = function () {
    $scope.reportFrom = new Date();
    $scope.reportTo   = new Date();
    $scope.loadBills();
  };

  $scope.setThisMonth = function () {
    var now = new Date();
    $scope.reportFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    $scope.reportTo   = now;
    $scope.loadBills();
  };

  $scope.loadBills = function () {
    $scope.reportLoading = true;
    $scope.bills = [];
    sp('sp_get_bills', { from_dt: fmtDate($scope.reportFrom), to_dt: fmtDate($scope.reportTo) })
      .then(function (res) {
        $scope.bills = (Array.isArray(res.data) ? res.data : []).map(function (b) {
          b.expanded = false;
          b.items    = null;
          return b;
        });
      })
      .catch(function () { $scope.showToast('Failed to load bills'); })
      .finally(function () { $scope.reportLoading = false; });
  };

  $scope.toggleBill = function (bill) {
    bill.expanded = !bill.expanded;
    if (bill.expanded && bill.items === null) {
      sp('sp_get_bill_dtl', { bill_id: bill.id }).then(function (res) {
        bill.items = Array.isArray(res.data) ? res.data : [];
      });
    }
  };

  $scope.reportTotalRevenue = function () {
    return $scope.bills.reduce(function (s, b) { return s + (b.total || 0); }, 0);
  };

  $scope.reportTotalItems = function () {
    return $scope.bills.reduce(function (s, b) { return s + (b.item_count || 0); }, 0);
  };

  // ─── Report: Items Count ─────────────────────────────────────────────────
  $scope.itemsCounts = [];
  $scope.icLoading   = false;
  $scope.icFrom      = new Date();
  $scope.icTo        = new Date();

  $scope.setIcToday = function () {
    $scope.icFrom = new Date();
    $scope.icTo   = new Date();
    $scope.loadItemsCount();
  };

  $scope.setIcThisMonth = function () {
    var now = new Date();
    $scope.icFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    $scope.icTo   = now;
    $scope.loadItemsCount();
  };

  $scope.loadItemsCount = function () {
    $scope.icLoading   = true;
    $scope.itemsCounts = [];
    sp('items_count', { st: fmtDate($scope.icFrom), en: fmtDate($scope.icTo) })
      .then(function (res) {
        $scope.itemsCounts = Array.isArray(res.data) ? res.data : [];
      })
      .catch(function () { $scope.showToast('Failed to load items count'); })
      .finally(function () { $scope.icLoading = false; });
  };

  $scope.icTotalQty = function () {
    return $scope.itemsCounts.reduce(function (s, i) { return s + (i.q || 0); }, 0);
  };

  // ─── Watchers: auto-load on tab switch ────────────────────────────────────
  $scope.$watch('reportTab', function (val) {
    if (!$scope.isLoggedIn) return;
    if (val === 1 && $scope.bills.length === 0)     $scope.loadBills();
    if (val === 3 && $scope.stockList.length === 0) loadStock();
    if (val === 4 && $scope.stockLog.length === 0)  loadStockLog();
  });

  $scope.$watch('manageTab', function (val) {
    if (!$scope.isLoggedIn) return;
    if (val === 4 && $scope.stockList.length === 0) loadStock();
  });

  $scope.$watch('inventoryTab', function (val) {
    if (!$scope.isLoggedIn) return;
    if (val === 2 && $scope.stockLog.length === 0)  loadStockLog();
    if (val === 3 && $scope.stockList.length === 0) loadStock();
  });

  // ─── Init ────────────────────────────────────────────────────────────────
  function loadAll() {
    loadItems();
    loadBarcodes();
    loadStock();
    loadStockLog();
    $scope.loadBills();
    $scope.loadItemsCount();
  }

  if ($scope.isLoggedIn) loadAll();

});
