import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateEmailLogCascade1780133225348 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Drop the legacy 'SET NULL' foreign key constraint
        await queryRunner.query(`
            ALTER TABLE "email_logs" 
            DROP CONSTRAINT IF EXISTS "FK_f61d9dd316d1a2c30bb55ed7579"
        `);

        // 2. Add the brand new 'CASCADE' constraint
        await queryRunner.query(`
            ALTER TABLE "email_logs" 
            ADD CONSTRAINT "FK_email_logs_user" 
            FOREIGN KEY ("userId") 
            REFERENCES "users"("id") 
            ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert setup: Drop the cascade constraint and revert to SET NULL
        await queryRunner.query(`
            ALTER TABLE "email_logs" 
            DROP CONSTRAINT IF EXISTS "FK_email_logs_user"
        `);

        await queryRunner.query(`
            ALTER TABLE "email_logs" 
            ADD CONSTRAINT "FK_f61d9dd316d1a2c30bb55ed7579" 
            FOREIGN KEY ("userId") 
            REFERENCES "users"("id") 
            ON DELETE SET NULL
        `);
    }

}
