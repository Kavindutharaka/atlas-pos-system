-- ============================================================
-- Atlas POS - Database Setup Script
-- DB: phvtech_Main (US hosted, use DATEADD(MINUTE,330,GETUTCDATE()) for SL time UTC+5:30)
-- Run this once to create tables, SPs and seed product data
-- ============================================================

USE phvtech_Main;
GO

-- ============================================================
-- TABLES
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='products' AND schema_id=SCHEMA_ID('dbo'))
CREATE TABLE dbo.products (
    code        NVARCHAR(20)  NOT NULL PRIMARY KEY,
    description NVARCHAR(200) NOT NULL,
    category    NVARCHAR(10)  NOT NULL,
    mrp         DECIMAL(10,2) NOT NULL DEFAULT 0,
    price       DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_active   BIT           NOT NULL DEFAULT 1
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='barcodes' AND schema_id=SCHEMA_ID('dbo'))
CREATE TABLE dbo.barcodes (
    barcode     NVARCHAR(50)  NOT NULL PRIMARY KEY,
    prod_code   NVARCHAR(20)  NOT NULL REFERENCES dbo.products(code),
    created_at  DATETIME      NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='bills' AND schema_id=SCHEMA_ID('dbo'))
CREATE TABLE dbo.bills (
    id          INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    bill_no     NVARCHAR(20)  NOT NULL,
    total       DECIMAL(10,2) NOT NULL,
    item_count  INT           NOT NULL,
    created_at  DATETIME      NOT NULL   -- stored as Sri Lanka time (UTC+5:30)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='bill_items' AND schema_id=SCHEMA_ID('dbo'))
CREATE TABLE dbo.bill_items (
    id          INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    bill_id     INT           NOT NULL REFERENCES dbo.bills(id),
    prod_code   NVARCHAR(20)  NULL,
    description NVARCHAR(200) NULL,
    qty         INT           NOT NULL,
    unit_price  DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL
);
GO

-- ============================================================
-- STORED PROCEDURES
-- ============================================================

-- sp_prods: Get all active products
IF OBJECT_ID('dbo.sp_prods','P') IS NOT NULL DROP PROC dbo.sp_prods;
GO
CREATE PROC dbo.sp_prods AS
BEGIN
    SELECT code, description, category, mrp, price
    FROM   dbo.products
    WHERE  is_active = 1
    ORDER  BY category, description;
END
GO

-- sp_save_prod: Upsert product (INSERT or UPDATE)
IF OBJECT_ID('dbo.sp_save_prod','P') IS NOT NULL DROP PROC dbo.sp_save_prod;
GO
CREATE PROC dbo.sp_save_prod
    @code  NVARCHAR(20),
    @desc  NVARCHAR(200),
    @cat   NVARCHAR(10),
    @mrp   DECIMAL(10,2),
    @price DECIMAL(10,2)
AS
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.products WHERE code = @code)
        UPDATE dbo.products
        SET    description = @desc, category = @cat, mrp = @mrp, price = @price, is_active = 1
        WHERE  code = @code;
    ELSE
        INSERT INTO dbo.products (code, description, category, mrp, price)
        VALUES (@code, @desc, @cat, @mrp, @price);
END
GO

-- sp_del_prod: Soft-delete a product
IF OBJECT_ID('dbo.sp_del_prod','P') IS NOT NULL DROP PROC dbo.sp_del_prod;
GO
CREATE PROC dbo.sp_del_prod
    @code NVARCHAR(20)
AS
BEGIN
    UPDATE dbo.products SET is_active = 0 WHERE code = @code;
END
GO

-- sp_get_bc: Get all barcode mappings
IF OBJECT_ID('dbo.sp_get_bc','P') IS NOT NULL DROP PROC dbo.sp_get_bc;
GO
CREATE PROC dbo.sp_get_bc AS
BEGIN
    SELECT b.barcode, b.prod_code AS code, p.description
    FROM   dbo.barcodes b
    LEFT JOIN dbo.products p ON p.code = b.prod_code
    ORDER  BY b.barcode;
END
GO

-- sp_save_bc: Upsert barcode mapping
IF OBJECT_ID('dbo.sp_save_bc','P') IS NOT NULL DROP PROC dbo.sp_save_bc;
GO
CREATE PROC dbo.sp_save_bc
    @barcode NVARCHAR(50),
    @code    NVARCHAR(20)
AS
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.barcodes WHERE barcode = @barcode)
        UPDATE dbo.barcodes SET prod_code = @code WHERE barcode = @barcode;
    ELSE
        INSERT INTO dbo.barcodes (barcode, prod_code, created_at)
        VALUES (@barcode, @code, DATEADD(MINUTE, 330, GETUTCDATE()));
END
GO

-- sp_del_bc: Delete barcode mapping
IF OBJECT_ID('dbo.sp_del_bc','P') IS NOT NULL DROP PROC dbo.sp_del_bc;
GO
CREATE PROC dbo.sp_del_bc
    @barcode NVARCHAR(50)
AS
BEGIN
    DELETE FROM dbo.barcodes WHERE barcode = @barcode;
END
GO

-- sp_save_bill: Insert bill header, returns new id + bill_no
IF OBJECT_ID('dbo.sp_save_bill','P') IS NOT NULL DROP PROC dbo.sp_save_bill;
GO
CREATE PROC dbo.sp_save_bill
    @total      DECIMAL(10,2),
    @item_count INT
AS
BEGIN
    DECLARE @sl_now  DATETIME    = DATEADD(MINUTE, 330, GETUTCDATE());
    DECLARE @bill_no NVARCHAR(20) = 'B' + FORMAT(@sl_now, 'yyyyMMddHHmmss');

    INSERT INTO dbo.bills (bill_no, total, item_count, created_at)
    VALUES (@bill_no, @total, @item_count, @sl_now);

    SELECT CAST(SCOPE_IDENTITY() AS INT) AS id, @bill_no AS bill_no;
END
GO

-- sp_save_bill_item: Insert one line item for a bill
IF OBJECT_ID('dbo.sp_save_bill_item','P') IS NOT NULL DROP PROC dbo.sp_save_bill_item;
GO
CREATE PROC dbo.sp_save_bill_item
    @bill_id     INT,
    @prod_code   NVARCHAR(20),
    @description NVARCHAR(200),
    @qty         INT,
    @unit_price  DECIMAL(10,2),
    @total_price DECIMAL(10,2)
AS
BEGIN
    INSERT INTO dbo.bill_items (bill_id, prod_code, description, qty, unit_price, total_price)
    VALUES (@bill_id, @prod_code, @description, @qty, @unit_price, @total_price);
END
GO

-- ============================================================
-- SEED DATA (products) — run only if table is empty
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM dbo.products)
BEGIN
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000103','Atl Water Bottle TC 550ml -0050','WB',400,200);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000604','Atl Water Bottle Eco Fit 720ml - 0050','WB',450,225);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000602','Atl Water Bottle Eco Fit 520ml - 0050','WB',400,200);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000605','Atlas Water Bottle ECO FLIP 520ml - 0050','WB',450,225);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000606','Atlas Water Bottle ECO FLIP 720ml - 0050','WB',470,235);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000801','Atl Water Bottle GeoPure 725ml -0050','WB',490,245);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000802','Atl Water Bottle Hydro 725ml - 0050','WB',490,245);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001102','Atlas Water Bottle Boxer 780ml -0050','WB',520,260);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001101','Atlas Water Bottle Gripper 780ml -0050','WB',520,260);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000901','Atl Wter Botle Refresh(Everest) 1L -0040','WB',650,325);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000902','Atl Water Bottle SuperFit 1L- 0040','WB',680,340);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001304','Atlas Water Bottle SOFTY 900ml - 0040','WB',690,345);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001302','Atlas Water Bottle ACTIVA 1L - 0040','WB',700,350);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001303','Atlas Water Bottle JUMBO 1.5L - 0040','WB',680,340);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000503','Atl SPLASH Water Bottle 740ml - 0048','WB',300,150);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9000303','Atlas Water Bottle Kids Tubby 650ml-0040','WB',750,375);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001305','Atlas Water Bottle Waterbuddy 750ml-0050','WB',520,260);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001306','Atlas Water Bottle Grippy 800ml-0050','WB',560,280);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001501','Atlas Water Bottle ZIPPY 900ml-0040','WB',1190,595);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240101','Atlas Lunch Box Small Snackkit -0036','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240102','Atlas Lunch Box Medium Home Fresh -0036','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240103','Atlas Lunch Box Large FitPAK -0036','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240105','Atlas Lunch Box Large ClearPAC -0036','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240106','Atlas Lunch Box Divider - 0024','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240111','Atlas Lunch Box Medium FUNKY (C) - 0036','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240110','Atlas Lunch Box Small CUTIE (C) - 0036','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240112','Atlas Lunch Box Kids Tiny Tummy-0036','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240113','Atlas Lunch Box Kids Tummy Pal- 0036','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240114','Atlas Lunch Box Luncher Pro-0020','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240117','Atlas Lunch Box Snacker-0036','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240115','Atlas Lunch Box Luncher Pro Divider-0018','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF7240116','Atlas Lunch Box Kids Bentgo-0024','LB',0,0);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001309','Atl Water Bottle Aqua 850ml-0040','WB',990,495);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001701','Atlas Water Bottle XL 2L - 0012','WB',1600,800);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001308','Atl Water Bottle Kids Design 600ml-0040','WB',770,385);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001307','Atl Water Bottle Kids Pro 650ml-0028','WB',1350,675);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001801','Atl Kids Wtr Btl junior Lite 500ml-0040','WB',540,270);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001802','Atlas Wtr Btl ZIPPY Lite 900ml-0040','WB',1090,545);
    INSERT INTO dbo.products (code,description,category,mrp,price) VALUES ('WF9001805','Atlas Wtr Btl ACTIVA Lite 1L - 0040','WB',600,300);
    PRINT 'Seed data inserted: 39 products';
END
GO

PRINT 'Setup complete.';

-- ============================================================
-- REPORT SPs (add-on — safe to run separately)
-- ============================================================

-- sp_get_bills: Get bills by date range (dates stored as SL time)
IF OBJECT_ID('dbo.sp_get_bills','P') IS NOT NULL DROP PROC dbo.sp_get_bills;
GO
CREATE PROC dbo.sp_get_bills
    @from_dt NVARCHAR(20),   -- 'YYYY-MM-DD'
    @to_dt   NVARCHAR(20)    -- 'YYYY-MM-DD'
AS
BEGIN
    SELECT id, bill_no, total, item_count, created_at
    FROM   dbo.bills
    WHERE  CAST(created_at AS DATE) >= CAST(@from_dt AS DATE)
    AND    CAST(created_at AS DATE) <= CAST(@to_dt   AS DATE)
    ORDER  BY created_at DESC;
END
GO

-- sp_get_bill_dtl: Get line items for a bill
IF OBJECT_ID('dbo.sp_get_bill_dtl','P') IS NOT NULL DROP PROC dbo.sp_get_bill_dtl;
GO
CREATE PROC dbo.sp_get_bill_dtl
    @bill_id INT
AS
BEGIN
    SELECT prod_code, description, qty, unit_price, total_price
    FROM   dbo.bill_items
    WHERE  bill_id = @bill_id
    ORDER  BY id;
END
GO
