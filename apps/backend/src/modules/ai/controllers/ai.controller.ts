import { BadRequestException, Body, Controller, Get, MessageEvent, Post, Req, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { AiQueryRequestSchema, type AuthContext, type AiQuotaView, type AiStreamChunk } from "@oms/dto";
import { CurrentUser, RequirePermissions } from "../../iam";
import { AI_PERMISSIONS } from "../contracts";
import { AiService } from "../services/ai.service";

@Controller("ai")
export class AiController {
  constructor(private readonly svc: AiService) {}

  @Get("quota")
  @RequirePermissions(AI_PERMISSIONS.query)
  async quota(@CurrentUser() ctx: AuthContext): Promise<AiQuotaView> {
    return this.svc.getQuota(ctx);
  }

  /**
   * SSE stream of structured JSON chunks to the SuperAdmin dashboard.
   * Each emitted MessageEvent.data is an AiStreamChunk. The terminal "done"
   * chunk always carries humanActionRequired: true — the AI proposes, a human
   * disposes. No endpoint here mutates business state.
   *
   * The request body is sent as a query param `q` (base64url JSON) because EventSource
   * is GET-only; a POST+fetch-stream client may instead call this with a body.
   */
  @Post("query")
  @RequirePermissions(AI_PERMISSIONS.query)
  @Sse()
  query(
    @CurrentUser() ctx: AuthContext,
    @Body() body: unknown,
    @Req() req: { on(ev: string, cb: () => void): void }
  ): Observable<MessageEvent> {
    const parsed = AiQueryRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const abort = new AbortController();
    req.on("close", () => abort.abort());

    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        try {
          for await (const chunk of this.svc.query(ctx, parsed.data, abort.signal)) {
            subscriber.next({ data: chunk satisfies AiStreamChunk });
            if (chunk.type === "done" || chunk.type === "error") break;
          }
          subscriber.complete();
        } catch (err) {
          subscriber.next({ data: { type: "error", message: (err as Error).message } satisfies AiStreamChunk });
          subscriber.complete();
        }
      })();

      return () => abort.abort();
    });
  }
}
