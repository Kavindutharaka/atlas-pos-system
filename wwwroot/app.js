var app = angular.module('APSApp', []);

app.controller('HomeCtrl', function ($scope, $http, $filter, $timeout, $q) {

  // ─── State ───────────────────────────────────────────────────────────────
  $scope.page = 1;
  $scope.manageTab = 1;
  $scope.today = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

  $scope.items = [];
  $scope.filteredItems = [];
  $scope.cart = [];
  $scope.barcodes = [];

  $scope.searchText = '';
  $scope.catFilter = '';
  $scope.manageSearch = '';
  $scope.manageCatFilter = '';

  $scope.showItemModal = false;
  $scope.showBillModal = false;
  $scope.selectedItem = {};
  $scope.modalQty = 1;

  $scope.formItem   = {};
  $scope.editMode   = false;
  $scope.formError  = '';
  $scope.imgFile    = null;   // selected File object
  $scope.imgPreview = null;   // base64 data URL for live preview

  $scope.barcodeForm = { barcode: '', code: '', foundItem: null, notFound: false };
  $scope.confirmData = { show: false };
  $scope.toast = { show: false, message: '' };
  $scope.loading = false;

  // ─── API helper ───────────────────────────────────────────────────────────
  function sp(sysId, params) {
    return $http.post('/api/Master/sp', { SysID: sysId, Params: params || null });
  }

  // Bridge: called from the file input's onchange (outside Angular digest)
  window._aPosImg = function (input) {
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
    var inp = document.getElementById('imgFileInput');
    if (inp) inp.value = '';
  }

  $scope.clearImage = function () { resetImage(); };

  // ─── Toast ────────────────────────────────────────────────────────────────
  $scope.showToast = function (msg) {
    $scope.toast = { show: true, message: msg };
    $timeout(function () { $scope.toast.show = false; }, 2500);
  };

  // ─── Confirm ─────────────────────────────────────────────────────────────
  $scope.showConfirm = function (title, message, cb) {
    $scope.confirmData = {
      show: true, title: title, message: message,
      onConfirm: function () { $scope.confirmData.show = false; cb(); }
    };
  };

  // ─── Load items from DB ───────────────────────────────────────────────────
  function loadItems() {
    $scope.loading = true;
    sp('sp_prods').then(function (res) {
      $scope.items = res.data;
      $scope.filterItems();
    }).catch(function () {
      $scope.showToast('Failed to load products from server');
    }).finally(function () {
      $scope.loading = false;
    });
  }

  // ─── Load barcodes from DB ────────────────────────────────────────────────
  function loadBarcodes() {
    sp('sp_get_bc').then(function (res) {
      $scope.barcodes = Array.isArray(res.data) ? res.data : [];
    });
  }

  loadItems();
  loadBarcodes();

  // ─── POS: search & filter ─────────────────────────────────────────────────
  $scope.filterItems = function () {
    var q = ($scope.searchText || '').toLowerCase().trim();
    var cat = $scope.catFilter || '';
    $scope.filteredItems = $scope.items.filter(function (item) {
      var matchCat = !cat || item.category === cat;
      var matchQ   = !q ||
        item.code.toLowerCase().indexOf(q) !== -1 ||
        item.description.toLowerCase().indexOf(q) !== -1;
      return matchCat && matchQ;
    });
  };

  $scope.searchItems = function () { $scope.filterItems(); };

  $scope.clearSearch = function () {
    $scope.searchText = '';
    $scope.filterItems();
  };

  $scope.onSearchKey = function (e) {
    if (e.keyCode === 13) {
      var q = ($scope.searchText || '').trim();
      // Check barcode map first
      var bc = $scope.barcodes.find(function (b) { return b.barcode === q; });
      if (bc) {
        var found = $scope.items.find(function (i) { return i.code === bc.code; });
        if (found) { $scope.openItemModal(found); return; }
      }
      $scope.filterItems();
      if ($scope.filteredItems.length === 1) {
        $scope.openItemModal($scope.filteredItems[0]);
      } else if ($scope.filteredItems.length === 0) {
        $scope.showToast('No item found: ' + q);
      }
    } else {
      $scope.filterItems();
    }
  };

  // ─── Item modal ───────────────────────────────────────────────────────────
  $scope.openItemModal = function (item) {
    $scope.selectedItem = item;
    $scope.modalQty = 1;
    $scope.showItemModal = true;
  };
  $scope.closeItemModal = function () { $scope.showItemModal = false; };

  $scope.addToCartFromModal = function () {
    var qty = parseInt($scope.modalQty) || 1;
    var existing = $scope.cart.find(function (r) { return r.item.code === $scope.selectedItem.code; });
    if (existing) { existing.qty += qty; }
    else { $scope.cart.push({ item: $scope.selectedItem, qty: qty }); }
    $scope.closeItemModal();
    $scope.searchText = '';
    $scope.filterItems();
    $scope.showToast('Added ' + qty + 'x ' + $scope.selectedItem.description.substring(0, 30));
  };

  // ─── Cart ─────────────────────────────────────────────────────────────────
  $scope.changeQty = function (row, delta) {
    row.qty += delta;
    if (row.qty <= 0) $scope.removeFromCart(row);
  };
  $scope.removeFromCart = function (row) {
    var idx = $scope.cart.indexOf(row);
    if (idx !== -1) $scope.cart.splice(idx, 1);
  };
  $scope.clearCart = function () {
    $scope.showConfirm('Clear Cart', 'Remove all items from cart?', function () {
      $scope.cart = [];
    });
  };
  $scope.cartTotal = function () {
    return $scope.cart.reduce(function (s, r) { return s + r.item.price * r.qty; }, 0);
  };

  // ─── Bill: save to DB then print ─────────────────────────────────────────
  $scope.openBillModal  = function () { $scope.showBillModal = true; };
  $scope.closeBillModal = function () { $scope.showBillModal = false; };

  $scope.printBill = function () {
    var cartSnapshot = angular.copy($scope.cart);
    var total        = $scope.cartTotal();

    // 1. Save bill header → get id + bill_no
    sp('sp_save_bill', { total: total, item_count: cartSnapshot.length })
      .then(function (res) {
        var row    = Array.isArray(res.data) ? res.data[0] : res.data;
        var billId = row.id;
        var billNo = row.bill_no;

        // 2. Save each cart item (fire in parallel)
        var saves = cartSnapshot.map(function (r) {
          return sp('sp_save_bill_item', {
            bill_id    : billId,
            prod_code  : r.item.code,
            description: r.item.description,
            qty        : r.qty,
            unit_price : r.item.price,
            total_price: r.item.price * r.qty
          });
        });

        $q.all(saves).then(function () {
          // 3. Print
          var content = document.getElementById('billPreview').innerHTML;
          var w = window.open('', '_blank', 'width=420,height=640');
          w.document.write('<html><head><title>Atlas Bill - ' + billNo + '</title>');
          w.document.write('<style>body{font-family:monospace;font-size:13px;padding:20px;width:350px;margin:0 auto;}@media print{body{width:100%;}}</style></head><body>');
          w.document.write(content);
          w.document.write('</body></html>');
          w.document.close();
          $timeout(function () { w.print(); }, 400);

          $scope.showToast('Bill ' + billNo + ' saved & sent to printer');
          $scope.cart = [];
          $scope.closeBillModal();
        });
      })
      .catch(function () {
        $scope.showToast('Error saving bill — check connection');
      });
  };

  // ─── Item Manage ──────────────────────────────────────────────────────────
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
    if (!f.code || !f.code.trim())        { $scope.formError = 'Item code is required.';  return; }
    if (!f.description || !f.description.trim()) { $scope.formError = 'Description is required.'; return; }
    if (!f.category)                      { $scope.formError = 'Category is required.';   return; }

    f.code  = f.code.trim().toUpperCase();
    f.mrp   = parseFloat(f.mrp)   || 0;
    f.price = parseFloat(f.price) || 0;

    sp('sp_save_prod', { code: f.code, desc: f.description, cat: f.category, mrp: f.mrp, price: f.price })
      .then(function () {
        // Upload image if a new file was chosen
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

  // ─── Report ───────────────────────────────────────────────────────────────

  $scope.bills = [];
  $scope.reportLoading = false;

  // Helper: format Date → 'YYYY-MM-DD' for <input type="date">
  function fmtDate(d) {
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  // Default to today
  $scope.reportFrom = fmtDate(new Date());
  $scope.reportTo   = fmtDate(new Date());

  $scope.setToday = function () {
    $scope.reportFrom = fmtDate(new Date());
    $scope.reportTo   = fmtDate(new Date());
    $scope.loadBills();
  };

  $scope.setThisMonth = function () {
    var now = new Date();
    var first = new Date(now.getFullYear(), now.getMonth(), 1);
    $scope.reportFrom = fmtDate(first);
    $scope.reportTo   = fmtDate(now);
    $scope.loadBills();
  };

  $scope.loadBills = function () {
    $scope.reportLoading = true;
    $scope.bills = [];
    sp('sp_get_bills', { from_dt: $scope.reportFrom, to_dt: $scope.reportTo })
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

  // Toggle expand — lazy-load items on first open
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

  // Auto-load when switching to report page
  $scope.$watch('page', function (val) {
    if (val === 3 && $scope.bills.length === 0) {
      $scope.loadBills();
    }
  });

});
