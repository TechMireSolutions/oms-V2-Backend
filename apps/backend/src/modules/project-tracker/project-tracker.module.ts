import { Module, Controller, Get, Post, Put, Delete, Body, Param, Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { getPrismaClient } from "@oms/db";

// Date-only normaliser — accepts "YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY",
// 2-digit years, or anything Date can parse; returns "YYYY-MM-DD" or null.
const cleanDate = (val: unknown): string | null => {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const m = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const a = m[1]!, b = m[2]!;
      let y = m[3]!;
      if (y.length === 2) y = "20" + y;
      const dd = parseInt(a, 10) > 12 ? a : b;
      const mm = parseInt(a, 10) > 12 ? b : a;
      return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

interface TrackerPayload {
  project_name: string;
  website_link: string | null;
  ojt_name: string | null;
  framework: string | null;
  lead_name: string | null;
  project_given_date: string | null;
  start_date: string | null;
  end_date: string | null;
  deadline: string | null;
  status: string;
}

const sanitizePayload = (body: any): TrackerPayload => ({
  project_name: body?.project_name?.toString().trim() || "",
  website_link: body?.website_link?.toString().trim() || null,
  ojt_name: body?.ojt_name?.toString().trim() || null,
  framework: body?.framework?.toString().trim() || null,
  lead_name: body?.lead_name?.toString().trim() || null,
  project_given_date: cleanDate(body?.project_given_date),
  start_date: cleanDate(body?.start_date),
  end_date: cleanDate(body?.end_date),
  deadline: cleanDate(body?.deadline),
  status: body?.status?.toString().trim() || "Not Started",
});

@Injectable()
class ProjectTrackerService {
  private readonly prisma = getPrismaClient();

  create(data: TrackerPayload) {
    return this.prisma.projectTracker.create({ data });
  }
  getAll() {
    return this.prisma.projectTracker.findMany({ orderBy: { createdAt: "desc" } });
  }
  getById(id: number) {
    return this.prisma.projectTracker.findUnique({ where: { id } });
  }
  async update(id: number, data: TrackerPayload) {
    return this.prisma.projectTracker.update({ where: { id }, data });
  }
  delete(id: number) {
    return this.prisma.projectTracker.delete({ where: { id } });
  }
}

@Controller("project-tracker")
class ProjectTrackerController {
  constructor(private readonly svc: ProjectTrackerService) {}

  @Post()
  async create(@Body() body: any) {
    const data = sanitizePayload(body);
    if (!data.project_name) throw new BadRequestException("project_name is required");
    const project = await this.svc.create(data);
    return { message: "Project created successfully", project };
  }

  @Get()
  async getAll() {
    const projects = await this.svc.getAll();
    return { projects };
  }

  @Post("bulk-import")
  async bulkImport(@Body() body: any) {
    const incoming: any[] = Array.isArray(body?.projects) ? body.projects : [];
    if (!incoming.length) throw new BadRequestException("No rows to import");
    let created = 0, skipped = 0;
    for (const row of incoming) {
      const data = sanitizePayload(row);
      if (!data.project_name) { skipped++; continue; }
      try { await this.svc.create(data); created++; }
      catch { skipped++; }
    }
    return { message: `Imported ${created}, skipped ${skipped}`, created, skipped };
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    const project = await this.svc.getById(Number(id));
    if (!project) throw new NotFoundException("Project not found");
    return { project };
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() body: any) {
    const existing = await this.svc.getById(Number(id));
    if (!existing) throw new NotFoundException("Project not found");
    const project = await this.svc.update(Number(id), sanitizePayload(body));
    return { message: "Project updated successfully", project };
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    const existing = await this.svc.getById(Number(id));
    if (!existing) throw new NotFoundException("Project not found");
    await this.svc.delete(Number(id));
    return { message: "Project deleted successfully" };
  }
}

@Module({ controllers: [ProjectTrackerController], providers: [ProjectTrackerService] })
export class ProjectTrackerModule {}
