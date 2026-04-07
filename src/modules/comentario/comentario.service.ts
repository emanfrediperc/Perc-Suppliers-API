import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Comentario, ComentarioDocument } from './schemas/comentario.schema';
import { CreateComentarioDto } from './dto/create-comentario.dto';

@Injectable()
export class ComentarioService {
  constructor(
    @InjectModel(Comentario.name) private comentarioModel: Model<ComentarioDocument>,
  ) {}

  async findByEntidad(entidad: string, entidadId: string) {
    return this.comentarioModel
      .find({ entidad, entidadId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async create(dto: CreateComentarioDto, user: { email: string; nombre: string }) {
    const comentario = new this.comentarioModel({
      ...dto,
      autorEmail: user.email,
      autorNombre: user.nombre,
    });
    return comentario.save();
  }

  async delete(id: string) {
    return this.comentarioModel.findByIdAndDelete(id).exec();
  }
}
