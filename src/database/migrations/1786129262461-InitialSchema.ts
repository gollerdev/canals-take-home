import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1786129262461 implements MigrationInterface {
  name = 'InitialSchema1786129262461';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" text NOT NULL, "name" text NOT NULL, CONSTRAINT "UQ_8536b8b85c06969f84f0c098b03" UNIQUE ("email"), CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "sku" text NOT NULL, "name" text NOT NULL, "price_cents" integer NOT NULL, CONSTRAINT "UQ_c44ac33a05b144dd0d9ddcf9327" UNIQUE ("sku"), CONSTRAINT "products_price_non_negative" CHECK (price_cents >= 0), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "warehouses" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" text NOT NULL, "name" text NOT NULL, "location" geography(Point,4326) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "address_line1" text NOT NULL, "address_line2" text, "address_city" text NOT NULL, "address_region" text, "address_postal_code" text, "address_country" character(2) NOT NULL, CONSTRAINT "UQ_d8b96d60ff9a288f5ed862280d9" UNIQUE ("code"), CONSTRAINT "warehouses_country_is_iso_alpha2" CHECK (address_country ~ '^[A-Z]{2}$'), CONSTRAINT "PK_56ae21ee2432b2270b48867e4be" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "warehouses_location_idx" ON "warehouses" USING gist ("location") `,
    );
    await queryRunner.query(
      `CREATE TABLE "inventory_items" ("warehouse_id" uuid NOT NULL, "product_id" uuid NOT NULL, "quantity_on_hand" integer NOT NULL, "quantity_reserved" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "inventory_not_oversold" CHECK (quantity_on_hand >= quantity_reserved), CONSTRAINT "inventory_reserved_non_negative" CHECK (quantity_reserved >= 0), CONSTRAINT "PK_8a1966ee908fde73f367016ac03" PRIMARY KEY ("warehouse_id", "product_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "inventory_items_product_idx" ON "inventory_items"  ("product_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("order_id" uuid NOT NULL, "product_id" uuid NOT NULL, "quantity" integer NOT NULL, "unit_price_cents" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "order_items_price_non_negative" CHECK (unit_price_cents >= 0), CONSTRAINT "order_items_quantity_positive" CHECK (quantity > 0), CONSTRAINT "PK_6335813ef19bc35b8d866cc6565" PRIMARY KEY ("order_id", "product_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "order_items_product_idx" ON "order_items"  ("product_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_failure_reason" AS ENUM('no_warehouse_available', 'payment_declined')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customer_id" uuid NOT NULL, "warehouse_id" uuid, "idempotency_key" text NOT NULL, "status" "public"."order_status" NOT NULL DEFAULT 'pending', "failure_reason" "public"."order_failure_reason", "shipping_location" geography(Point,4326), "total_cents" integer NOT NULL, "payment_reference" text, "shipping_line1" text NOT NULL, "shipping_line2" text, "shipping_city" text NOT NULL, "shipping_region" text, "shipping_postal_code" text, "shipping_country" character(2) NOT NULL, CONSTRAINT "orders_idempotency_unique" UNIQUE ("customer_id", "idempotency_key"), CONSTRAINT "orders_country_is_iso_alpha2" CHECK (shipping_country ~ '^[A-Z]{2}$'), CONSTRAINT "orders_unfailed_has_no_reason" CHECK (status = 'failed' OR failure_reason IS NULL), CONSTRAINT "orders_failed_has_reason" CHECK (status <> 'failed' OR failure_reason IS NOT NULL), CONSTRAINT "orders_confirmed_is_complete" CHECK (status <> 'confirmed' OR (warehouse_id IS NOT NULL AND payment_reference IS NOT NULL)), CONSTRAINT "orders_total_non_negative" CHECK (total_cents >= 0), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "orders_warehouse_idx" ON "orders"  ("warehouse_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "orders_customer_idx" ON "orders"  ("customer_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_items" ADD CONSTRAINT "FK_8031a82801e54f045bfe79efc0a" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_items" ADD CONSTRAINT "FK_8e17955a29e8b63bb8cec3d32c5" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_a1fd4de5944756bdb80799b00bc" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_a1fd4de5944756bdb80799b00bc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_items" DROP CONSTRAINT "FK_8e17955a29e8b63bb8cec3d32c5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_items" DROP CONSTRAINT "FK_8031a82801e54f045bfe79efc0a"`,
    );
    await queryRunner.query(`DROP INDEX "public"."orders_customer_idx"`);
    await queryRunner.query(`DROP INDEX "public"."orders_warehouse_idx"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."order_failure_reason"`);
    await queryRunner.query(`DROP TYPE "public"."order_status"`);
    await queryRunner.query(`DROP INDEX "public"."order_items_product_idx"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."inventory_items_product_idx"`,
    );
    await queryRunner.query(`DROP TABLE "inventory_items"`);
    await queryRunner.query(`DROP INDEX "public"."warehouses_location_idx"`);
    await queryRunner.query(`DROP TABLE "warehouses"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "customers"`);
  }
}
