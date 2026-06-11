import type { SkillDefinition } from "../models/skill.js";

export interface ValidationError {
  field: string;
  message: string;
}

export class SkillValidator {
  validate(def: SkillDefinition): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!def.id || typeof def.id !== "string") {
      errors.push({ field: "id", message: "id is required and must be a string" });
    }
    if (!def.name || typeof def.name !== "string") {
      errors.push({ field: "name", message: "name is required and must be a string" });
    }
    if (!def.version || typeof def.version !== "string") {
      errors.push({ field: "version", message: "version is required and must be a string" });
    }
    if (!def.description || typeof def.description !== "string") {
      errors.push({ field: "description", message: "description is required" });
    }
    if (!Array.isArray(def.tags)) {
      errors.push({ field: "tags", message: "tags must be an array" });
    }
    if (typeof def.enabled !== "boolean") {
      errors.push({ field: "enabled", message: "enabled must be a boolean" });
    }

    return errors;
  }

  isValid(def: SkillDefinition): boolean {
    return this.validate(def).length === 0;
  }
}
