import { Check, Copy, MessageSquare } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { AtomKindBadges } from "~/components/skills/atom-kind-badge";
import { DownloadButton } from "~/components/skills/download-button";
import { SkillSidebar } from "~/components/skills/skill-sidebar";
import { SkillTabs } from "~/components/skills/skill-tabs";
import { StarButton } from "~/components/skills/star-button";
import { TalkToSkillWidget, type TalkToSkillWidgetHandle } from "~/components/skills/talk-to-skill-widget";
import { TrustBadge } from "~/components/skills/trust-badge";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { useCopyToClipboard } from "~/hooks/use-copy-to-clipboard";
import { safeParseJson, safeParsePermissions } from "~/lib/format";
import type { ScanDetails, SkillDetailResult } from "~/lib/skills/data";
import { extractAtomKinds } from "~/lib/skills/atoms";
import { buildSecurityTab } from "~/screens/skill-detail-helpers";

const MOBILE_TRIGGER_LIMIT = 6;

function parseDescription(raw: string | null): { summary: string; triggers: string[] } {
  if (!raw) return { summary: "", triggers: [] };

  const triggerIdx = raw.indexOf("Triggers:");
  if (triggerIdx === -1) return { summary: raw.trim(), triggers: [] };

  const summary = raw
    .slice(0, triggerIdx)
    .replace(/\.\s*$/, "")
    .trim();
  const triggerStr = raw
    .slice(triggerIdx + "Triggers:".length)
    .replace(/\.$/, "")
    .trim();
  const triggers = triggerStr
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return { summary, triggers };
}

interface SkillDetailScreenProps {
  data: SkillDetailResult;
  talkEnabled: boolean;
}

function MobileActionBar({
  data,
  scanDetails,
  talkEnabled,
  onTalkClick,
}: {
  data: SkillDetailResult;
  scanDetails: ScanDetails | null;
  talkEnabled: boolean;
  onTalkClick: () => void;
}) {
  const installCmd = `tank install ${data.name}`;
  const { copied, copy } = useCopyToClipboard();

  return (
    <div
      className="lg:hidden mb-4 space-y-3 rounded-lg border border-border bg-card p-3"
      data-testid="mobile-action-bar">
      <div className="flex items-center gap-2 flex-wrap">
        <StarButton skillName={data.name} initialStarred={data.isStarred} initialCount={data.starCount} />
        {data.latestVersion && <DownloadButton skillName={data.name} version={data.latestVersion.version} />}
        {talkEnabled && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onTalkClick}
            data-testid="talk-button-mobile">
            <MessageSquare className="size-3.5" />
            Talk to package
          </Button>
        )}
        {scanDetails && (
          <TrustBadge
            verdict={scanDetails.verdict}
            criticalCount={scanDetails.criticalCount}
            highCount={scanDetails.highCount}
            mediumCount={scanDetails.mediumCount}
          />
        )}
      </div>
      <Separator />
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded border bg-muted/50 px-2 py-1.5 font-mono text-xs">
          {installCmd}
        </code>
        <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 text-xs" onClick={() => copy(installCmd)}>
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function SkillDetailScreen({ data, talkEnabled }: SkillDetailScreenProps) {
  const [activeTab, setActiveTab] = useState("readme");
  const [triggersExpanded, setTriggersExpanded] = useState(false);
  const talkWidgetRef = useRef<TalkToSkillWidgetHandle>(null);
  const latestManifest = safeParseJson(data.latestVersion?.manifest);
  const fileList: string[] = Array.isArray(latestManifest?.files) ? (latestManifest.files as string[]) : [];
  const license = typeof latestManifest?.license === "string" ? latestManifest.license : null;
  const permissions = safeParsePermissions(data.latestVersion?.permissions);

  const permItems: string[] = [];
  if (permissions?.network?.outbound?.length) permItems.push(`Network: ${permissions.network.outbound.length} host(s)`);
  if (permissions?.filesystem?.read?.length || permissions?.filesystem?.write?.length)
    permItems.push("Filesystem access");
  if (permissions?.subprocess) permItems.push("Subprocess execution");

  const readmeContent = data.latestVersion?.readme;
  const scanDetails = data.latestVersion?.scanDetails;
  const hasSecurityData = scanDetails != null;

  const securityTab = hasSecurityData && scanDetails ? buildSecurityTab({ data, scanDetails }) : null;
  const desc = useMemo(() => parseDescription(data.description), [data.description]);
  const atomKinds = extractAtomKinds(latestManifest);
  const atomsList = Array.isArray(latestManifest?.atoms) ? (latestManifest.atoms as Record<string, unknown>[]) : [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="skill-detail-root">
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight font-mono break-all sm:break-normal">
            {data.name}
          </h1>
          {data.latestVersion && (
            <Badge variant="secondary" className="font-mono text-xs">
              {data.latestVersion.version}
            </Badge>
          )}
          {data.visibility === "private" && (
            <Badge variant="outline" className="text-xs">
              Private
            </Badge>
          )}
          <div data-testid="skill-detail-atom-badges">
            <AtomKindBadges kinds={atomKinds} size="sm" />
          </div>
          {talkEnabled && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 hidden lg:inline-flex"
              onClick={() => talkWidgetRef.current?.trigger()}
              data-testid="talk-button-header">
              <MessageSquare className="size-3.5" />
              Talk to this package
            </Button>
          )}
        </div>
        {desc.summary && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">Description</h3>
            <p className="text-sm text-foreground/80 leading-relaxed">{desc.summary}.</p>
          </div>
        )}
        {desc.triggers.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">Triggered by</h3>
            <div className="flex flex-wrap gap-1.5" data-testid="trigger-badges">
              {(triggersExpanded ? desc.triggers : desc.triggers.slice(0, MOBILE_TRIGGER_LIMIT)).map((trigger) => (
                <Badge key={trigger} variant="outline" className="text-xs font-normal" data-testid="trigger-badge">
                  {trigger}
                </Badge>
              ))}
              {!triggersExpanded && desc.triggers.length > MOBILE_TRIGGER_LIMIT && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => setTriggersExpanded(true)}
                  data-testid="triggers-show-more">
                  +{desc.triggers.length - MOBILE_TRIGGER_LIMIT} more
                </Button>
              )}
              {triggersExpanded && desc.triggers.length > MOBILE_TRIGGER_LIMIT && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => setTriggersExpanded(false)}
                  data-testid="triggers-show-less">
                  show less
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <MobileActionBar
        data={data}
        scanDetails={scanDetails ?? null}
        talkEnabled={talkEnabled}
        onTalkClick={() => talkWidgetRef.current?.trigger()}
      />

      {talkEnabled && (
        <TalkToSkillWidget
          ref={talkWidgetRef}
          skillName={data.name}
          chatLink={data.latestVersion?.prompt2botChatLink ?? null}
          botPublicKey={data.latestVersion?.prompt2botBotPublicKey ?? null}
        />
      )}

      <SkillTabs
        readmeContent={readmeContent ?? null}
        versions={data.versions.map((v) => ({
          ...v,
          publishedAt: v.publishedAt instanceof Date ? v.publishedAt.toISOString() : String(v.publishedAt),
        }))}
        files={fileList}
        skillName={data.name}
        version={data.latestVersion?.version ?? ""}
        readme={data.latestVersion?.readme ?? null}
        manifest={latestManifest}
        securityTab={securityTab}
        hasSecurityData={hasSecurityData}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        atoms={atomsList}
        sidebar={
          <SkillSidebar
            name={data.name}
            repositoryUrl={data.repositoryUrl}
            starCount={data.starCount}
            downloadCount={data.downloadCount}
            visibility={data.visibility}
            isStarred={data.isStarred}
            description={data.description}
            hasReadme={!!readmeContent}
            hasPermissionsDeclared={!!permissions}
            publisher={data.publisher}
            latestVersion={data.latestVersion}
            license={license}
            scanDetails={scanDetails ?? null}
            hasSecurityData={hasSecurityData}
            permItems={permItems}
            atomKinds={atomKinds}
          />
        }
      />
    </div>
  );
}
