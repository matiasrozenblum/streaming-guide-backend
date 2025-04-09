import { Controller, Get, Post, Body, Param, Delete, Patch, UseGuards } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { Program } from './programs.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UpdateProgramDto } from './dto/update-program.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('programs')  // Etiqueta para los programas
@Controller('programs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all programs' })
  @ApiResponse({ status: 200, description: 'Return all programs.' })
  findAll(): Promise<Program[]> {
    return this.programsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a program by id' })
  @ApiResponse({ status: 200, description: 'Return the program.' })
  @ApiResponse({ status: 404, description: 'Program not found.' })
  findOne(@Param('id') id: string): Promise<Program> {
    return this.programsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new program' })
  @ApiResponse({ status: 201, description: 'The program has been successfully created.' })
  create(@Body() createProgramDto: CreateProgramDto): Promise<Program> {
    return this.programsService.create(createProgramDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a program' })
  @ApiResponse({ status: 200, description: 'The program has been successfully updated.' })
  @ApiResponse({ status: 404, description: 'Program not found.' })
  update(@Param('id') id: string, @Body() updateProgramDto: UpdateProgramDto): Promise<Program> {
    return this.programsService.update(Number(id), updateProgramDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a program' })
  @ApiResponse({ status: 200, description: 'The program has been successfully deleted.' })
  @ApiResponse({ status: 404, description: 'Program not found.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.programsService.remove(id);
  }
}