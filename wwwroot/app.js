var app = angular.module('APSApp', []);

app.controller('HomeCtrl', function ($scope, $http, $timeout, $q) {

  // ─── State ───────────────────────────────────────────────────────────────
  $scope.today = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

  $scope.items         = [];
  $scope.filteredItems = [];
  $scope.cart          = [];
  $scope.barcodes      = [];

  $scope.searchText = '';
  $scope.catFilter  = '';

  $scope.showItemModal = false;
  $scope.showBillModal = false;
  $scope.selectedItem  = {};
  $scope.modalQty      = 1;

  $scope.confirmData = { show: false };
  $scope.toast       = { show: false, message: '' };
  $scope.loading     = false;
  $scope.billNo      = '';   // set by printBill() after save, used in bill template

  // ─── API helper ───────────────────────────────────────────────────────────
  function sp(sysId, params) {
    return $http.post('/api/Master/sp', { SysID: sysId, Params: params || null });
  }

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
    var q   = ($scope.searchText || '').toLowerCase().trim();
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
    var qty      = parseInt($scope.modalQty) || 1;
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

    sp('sp_save_bill', { total: total, item_count: cartSnapshot.length })
      .then(function (res) {
        var row    = Array.isArray(res.data) ? res.data[0] : res.data;
        var billId = row.id;
        var billNo = row.bill_no;

        $scope.billNo = billNo; // update template so innerHTML capture has bill no

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

        // Use $timeout(0) so Angular digest updates {{billNo}} in the DOM before capture
        $q.all(saves).then(function () {
          $timeout(function () {
            var content = document.getElementById('billPreview').innerHTML;
            var w = window.open('', '_blank', 'width=460,height=700');
            w.document.write('<html><head><title>Bill ' + billNo + '</title>');
            w.document.write('<style>');
            w.document.write('@page{margin:4mm;} ');
            w.document.write('body{font-family:"Courier New",Courier,monospace;font-size:15px;padding:6px;width:76mm;margin:0 auto;line-height:1.5;} ');
            w.document.write('@media print{body{width:100%;padding:2px;font-size:14px;}}');
            w.document.write('</style></head><body>');
            w.document.write(content);
            w.document.write('</body></html>');
            w.document.close();
            $timeout(function () { w.print(); }, 400);

            $scope.showToast('Bill ' + billNo + ' saved & sent to printer');
            $scope.cart   = [];
            $scope.billNo = '';
            $scope.closeBillModal();
          }, 0);
        });
      })
      .catch(function () {
        $scope.showToast('Error saving bill — check connection');
      });
  };

});
