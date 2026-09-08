"use client";

/**
 * NGO analytics.
 *
 * Reads the analytics endpoints that previously had no frontend at all:
 * ngo-overview, skill-gaps, urgency-distribution, hotzone-ranking, trend and
 * leaderboard. Each panel offers a table view, so nothing here depends on
 * colour vision to be readable.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, MapPin, Users } from "lucide-react";

import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";
import { useTheme } from "../../../components/ui/ThemeProvider";
import { chartTheme, URGENCY_LEVELS } from "../../../components/ui/chart-tokens";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingCard,
  PageHeader,
  Button,
  Segmented,
  StatTile,
  DataTable,
} from "../../../components/ui/primitives";
import type {
  AnalyticsOverview,
  CoverageRun,
  Hotzone,
  LeaderboardRow,
  SkillGap,
  TrendPoint,
  UrgencyDistribution,
  VolunteerActivity,
} from "../../../lib/types";

type View = "chart" | "table";
type Strategy = "skill_first" | "proximity_first" | "random";

const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: "skill_first", label: "Skill first" },
  { value: "proximity_first", label: "Nearest first" },
  { value: "random", label: "Random" },
];

interface Analytics {
  overview: AnalyticsOverview | null;
  gaps: SkillGap[];
  urgency: UrgencyDistribution | null;
  hotzones: Hotzone[];
  trend: TrendPoint[];
  leaderboard: LeaderboardRow[];
  needTypes: { type: string; count: number }[];
  activity: VolunteerActivity[];
  runs: CoverageRun[];
}

const EMPTY: Analytics = {
  overview: null,
  gaps: [],
  urgency: null,
  hotzones: [],
  trend: [],
  leaderboard: [],
  needTypes: [],
  activity: [],
  runs: [],
};

/** Panels load independently: one failing endpoint must not blank the page. */
async function settled<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export default function NGOAnalyticsPage() {
  const { user } = useNGOAuth();
  const { theme } = useTheme();
  const colors = chartTheme(theme === "dark");

  const [data, setData] = useState<Analytics>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [gapView, setGapView] = useState<View>("chart");
  const [zoneView, setZoneView] = useState<View>("chart");
  const [strategy, setStrategy] = useState<Strategy>("skill_first");
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    if (!user?.token) return;
    const token = user.token;
    setLoading(true);
    setError("");

    try {
      const [overview, gaps, urgency, hotzones, trend, leaderboard, needTypes, activity, runs] =
        await Promise.all([
        settled(api.ngoOverview(token), null as AnalyticsOverview | null),
        settled(
          api.skillGaps(token).then((r) => r.gaps),
          [] as SkillGap[],
        ),
        settled(api.urgencyDistribution(token), null as UrgencyDistribution | null),
        settled(
          api.hotzoneRanking(token).then((r) => r.hotzones),
          [] as Hotzone[],
        ),
        settled(
          api.activityTrend(token, 14).then((r) => r.trend),
          [] as TrendPoint[],
        ),
        settled(
          api.leaderboard(token).then((r) => r.leaderboard),
          [] as LeaderboardRow[],
        ),
        settled(
          api.needsByType(token).then((r) => r.needs_by_type),
          [] as { type: string; count: number }[],
        ),
        settled(
          api.volunteerActivity(token).then((r) => r.data),
          [] as VolunteerActivity[],
        ),
        settled(
          api.coverageHistory(token).then((r) => r.history),
          [] as CoverageRun[],
        ),
      ]);
      setData({
        overview, gaps, urgency, hotzones, trend, leaderboard, needTypes, activity, runs,
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    load();
  }, [load]);

  const urgencyData = useMemo(() => {
    if (!data.urgency) return [];
    return URGENCY_LEVELS.map((level) => ({
      level: level[0].toUpperCase() + level.slice(1),
      count: data.urgency?.[level] ?? 0,
    }));
  }, [data.urgency]);

  const runSimulation = async () => {
    if (!user?.token) return;
    setSimulating(true);
    try {
      await api.runSimulation(user.token, strategy);
      load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSimulating(false);
    }
  };

  const tooltipStyle = {
    background: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: 10,
    color: colors.text,
    fontSize: 12,
  };

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="Analytics" description="How your operation is performing." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <LoadingCard key={i} lines={2} />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <LoadingCard lines={6} />
          <LoadingCard lines={6} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <PageHeader title="Analytics" />
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      </div>
    );
  }

  const { overview, gaps, hotzones, trend, leaderboard, needTypes, activity, runs } = data;

  return (
    <div className="p-6">
      <PageHeader
        title="Analytics"
        description="How your operation is performing across tasks, people and places."
      />

      {/* A single number is a stat tile, not a chart. */}
      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Tasks completed"
          value={overview?.tasks.completed ?? 0}
          hint={`${overview?.tasks.completion_rate_pct ?? 0}% completion rate`}
          tone={(overview?.tasks.completion_rate_pct ?? 0) >= 60 ? "success" : "warning"}
          icon={<CheckCircle2 size={16} />}
        />
        <StatTile
          label="Open tasks"
          value={overview?.tasks.open ?? 0}
          hint={`${overview?.tasks.in_progress ?? 0} in progress`}
          icon={<AlertTriangle size={16} />}
        />
        <StatTile
          label="Active volunteers"
          value={overview?.volunteers.active ?? 0}
          hint={`${overview?.volunteers.utilization_pct ?? 0}% of ${overview?.volunteers.total ?? 0}`}
          icon={<Users size={16} />}
        />
        <StatTile
          label="Avg match score"
          value={overview?.assignments.avg_match_score?.toFixed(2) ?? "0.00"}
          hint={`${overview?.assignments.total ?? 0} assignments made`}
        />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Two series, so a legend is always present. */}
        <Card>
          <CardHeader
            title="Skill gaps"
            description="Where demand for a skill exceeds the volunteers who have it."
            action={
              <Segmented
                label="Skill gap view"
                value={gapView}
                onChange={setGapView}
                options={[
                  { value: "chart", label: "Chart" },
                  { value: "table", label: "Table" },
                ]}
              />
            }
          />
          {gaps.length === 0 ? (
            <EmptyState
              title="No skill data yet"
              description="Create tasks that require skills and the gaps will appear here."
            />
          ) : gapView === "table" ? (
            <DataTable
              rows={gaps}
              rowKey={(r) => r.skill}
              columns={[
                { key: "skill", header: "Skill", render: (r) => r.skill },
                { key: "demand", header: "Demand", numeric: true, render: (r) => r.demand },
                { key: "supply", header: "Supply", numeric: true, render: (r) => r.supply },
                {
                  key: "gap",
                  header: "Gap",
                  numeric: true,
                  render: (r) =>
                    r.gap > 0 ? <Badge tone="danger">-{r.gap}</Badge> : <span>0</span>,
                },
              ]}
            />
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={Math.max(220, gaps.length * 38)}>
                <BarChart data={gaps.slice(0, 8)} layout="vertical" barGap={2}>
                  <CartesianGrid horizontal={false} stroke={colors.grid} />
                  <XAxis type="number" stroke={colors.axis} fontSize={11} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="skill"
                    stroke={colors.axis}
                    fontSize={11}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: colors.grid, opacity: 0.4 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: colors.axis }} />
                  <Bar dataKey="demand" name="Demand" fill={colors.series[0]} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="supply" name="Supply" fill={colors.series[1]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Ordinal severity: one hue, stepped. Order carries the meaning. */}
        <Card>
          <CardHeader title="Urgency distribution" description="Reported needs by severity band." />
          {urgencyData.every((d) => d.count === 0) ? (
            <EmptyState
              title="No needs recorded yet"
              description="Ingest a field report and its urgency will be charted here."
            />
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={urgencyData}>
                  <CartesianGrid vertical={false} stroke={colors.grid} />
                  <XAxis dataKey="level" stroke={colors.axis} fontSize={11} />
                  <YAxis stroke={colors.axis} fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: colors.grid, opacity: 0.4 }}
                  />
                  <Bar dataKey="count" name="Needs" radius={[4, 4, 0, 0]}>
                    {urgencyData.map((entry, index) => (
                      <Cell key={entry.level} fill={colors.urgency[index]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* One series over time: area, no legend. The title names it. */}
        <Card>
          <CardHeader title="Reports over time" description="Needs reported in the last 14 days." />
          {trend.length === 0 ? (
            <EmptyState
              title="No activity recorded"
              description="Field reports will chart here once they start arriving."
            />
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.series[0]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={colors.series[0]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={colors.grid} />
                  <XAxis
                    dataKey="date"
                    stroke={colors.axis}
                    fontSize={11}
                    tickFormatter={(value: string) => String(value).slice(5)}
                  />
                  <YAxis stroke={colors.axis} fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Reports"
                    stroke={colors.series[0]}
                    strokeWidth={2}
                    fill="url(#trendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Hot zones"
            description="Locations carrying the most urgency."
            action={
              <Segmented
                label="Hot zone view"
                value={zoneView}
                onChange={setZoneView}
                options={[
                  { value: "chart", label: "Chart" },
                  { value: "table", label: "Table" },
                ]}
              />
            }
          />
          {hotzones.length === 0 ? (
            <EmptyState
              title="No mapped zones yet"
              description="Needs with a location will rank here by total urgency."
              icon={<MapPin size={28} />}
            />
          ) : zoneView === "table" ? (
            <DataTable
              rows={hotzones}
              rowKey={(r) => r.zone}
              columns={[
                { key: "zone", header: "Zone", render: (r) => r.zone },
                { key: "needs", header: "Needs", numeric: true, render: (r) => r.need_count },
                { key: "urg", header: "Urgency", numeric: true, render: (r) => r.total_urgency },
                { key: "aff", header: "Affected", numeric: true, render: (r) => r.total_affected ?? 0 },
              ]}
            />
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={Math.max(220, hotzones.length * 34)}>
                <BarChart data={hotzones.slice(0, 8)} layout="vertical">
                  <CartesianGrid horizontal={false} stroke={colors.grid} />
                  <XAxis type="number" stroke={colors.axis} fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="zone"
                    stroke={colors.axis}
                    fontSize={11}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: colors.grid, opacity: 0.4 }}
                  />
                  <Bar
                    dataKey="total_urgency"
                    name="Total urgency"
                    fill={colors.series[0]}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* One series, so no legend: the title names it. */}
        <Card>
          <CardHeader title="Needs by type" description="What your reports are about." />
          {needTypes.length === 0 ? (
            <EmptyState
              title="No needs recorded yet"
              description="Submit a field report and its category will appear here."
            />
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={Math.max(200, needTypes.length * 34)}>
                <BarChart data={needTypes} layout="vertical">
                  <CartesianGrid horizontal={false} stroke={colors.grid} />
                  <XAxis type="number" stroke={colors.axis} fontSize={11} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="type"
                    stroke={colors.axis}
                    fontSize={11}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: colors.grid, opacity: 0.4 }}
                  />
                  <Bar dataKey="count" name="Needs" fill={colors.series[0]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Volunteer activity"
            description="Reputation and experience from the knowledge graph."
          />
          {activity.length === 0 ? (
            <EmptyState
              title="No graph activity yet"
              description="Activity appears once volunteers save a profile and complete work."
              icon={<Users size={28} />}
            />
          ) : (
            <DataTable
              rows={activity}
              rowKey={(r, i) => `${r.name}-${i}`}
              columns={[
                { key: "name", header: "Volunteer", render: (r) => r.name ?? "Unknown" },
                { key: "done", header: "Completed", numeric: true, render: (r) => r.tasks_completed },
                { key: "xp", header: "XP", numeric: true, render: (r) => r.xp },
                {
                  key: "rep",
                  header: "Reputation",
                  numeric: true,
                  render: (r) => Math.round(r.reputation),
                },
              ]}
            />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Coverage simulation"
          description="Model how a strategy would perform, then compare past runs."
          action={
            <div className="flex items-center gap-2">
              <Segmented
                label="Assignment strategy"
                value={strategy}
                onChange={setStrategy}
                options={STRATEGIES}
              />
              <Button loading={simulating} onClick={runSimulation}>
                Run
              </Button>
            </div>
          }
        />
        {runs.length === 0 ? (
          <EmptyState
            title="No simulations run yet"
            description="Pick a strategy and run one; results are kept here for comparison."
          />
        ) : (
          <DataTable
            rows={runs}
            rowKey={(r) => r.run_id}
            columns={[
              { key: "date", header: "Date", render: (r) => r.timestamp },
              { key: "strategy", header: "Strategy", render: (r) => <Badge>{r.strategy}</Badge> },
              {
                key: "coverage",
                header: "Coverage",
                numeric: true,
                render: (r) => `${Math.round(r.coverage_pct * 100) / 100}%`,
              },
            ]}
          />
        )}
      </Card>

      {/* Ranked identity plus several numbers reads better as a table. */}
      <Card className="mt-4">
        <CardHeader title="Top volunteers" description="Ranked by completed assignments." />
        {leaderboard.length === 0 ? (
          <EmptyState
            title="No completed assignments yet"
            description="Once volunteers finish tasks they will be ranked here."
            icon={<Users size={28} />}
          />
        ) : (
          <DataTable
            rows={leaderboard}
            rowKey={(r) => r.volunteer_id}
            columns={[
              { key: "rank", header: "#", render: (r) => r.rank },
              { key: "name", header: "Volunteer", render: (r) => r.name },
              { key: "done", header: "Completed", numeric: true, render: (r) => r.completed_tasks },
              {
                key: "hours",
                header: "Hours",
                numeric: true,
                render: (r) => (r.hours_contributed ?? 0).toFixed(1),
              },
              {
                key: "rating",
                header: "Avg rating",
                numeric: true,
                render: (r) => (r.avg_rating ? r.avg_rating.toFixed(1) : "—"),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
