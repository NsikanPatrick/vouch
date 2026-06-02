import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOtpVerificationEntity1780324237884 implements MigrationInterface {
    name = 'CreateOtpVerificationEntity1780324237884'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "otp_verifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "email" character varying NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "isUsed" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_91d17e75ac3182dba6701869b39" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "otp_verifications"`);
    }

}
