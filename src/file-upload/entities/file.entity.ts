import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('uploaded_files')
export class FileEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    url: string;

    @Column()
    cloudinaryPublicId: string;

    @Column({ nullable: true })
    originalName: string;

    @Column({ nullable: true })
    mimeType: string;

    @Column({ nullable: true })
    folder: string;

    @CreateDateColumn()
    createdAt: Date;
}