import { IsString } from 'class-validator';

export class AssignCaptainDto {
  @IsString()
  targetUserId!: string;
}
