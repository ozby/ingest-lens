export interface DemoFixtureMetadata {
  id: string;
  sourceSystem: string;
  sourceUrl: string;
  contractHint: "job-posting-v1";
  summary: string;
}

export interface DemoFixtureDetail extends DemoFixtureMetadata {
  payload: Record<string, unknown>;
}

const DEMO_FIXTURES: DemoFixtureDetail[] = [
  {
    id: "ashby-job-001",
    sourceSystem: "ashby",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    contractHint: "job-posting-v1",
    summary: "Staff Software Engineer, Backend",
    payload: {
      title: "Staff Software Engineer, Backend",
      apply_url: "https://jobs.ashbyhq.com/example-co/abc123",
      employment_type: "FullTime",
      department: "Engineering",
      locations: ["Remote"],
    },
  },
  {
    id: "ashby-job-002",
    sourceSystem: "ashby",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    contractHint: "job-posting-v1",
    summary: "Product Designer",
    payload: {
      title: "Product Designer",
      apply_url: "https://jobs.ashbyhq.com/example-co/def456",
      employment_type: "FullTime",
      department: "Design",
      locations: ["San Francisco, CA"],
    },
  },
  {
    id: "ashby-job-003",
    sourceSystem: "ashby",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    contractHint: "job-posting-v1",
    summary: "AI Platform Engineer",
    payload: {
      title: "AI Platform Engineer",
      apply_url: "https://jobs.ashbyhq.com/0g/ghi789",
      employment_type: "FullTime",
      department: "AI Infrastructure",
      locations: ["Remote", "New York, NY"],
    },
  },
  {
    id: "ashby-job-004",
    sourceSystem: "ashby",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    contractHint: "job-posting-v1",
    summary: "Senior Product Engineer",
    payload: {
      title: "Senior Product Engineer",
      apply_url: "https://jobs.ashbyhq.com/example-co/jkl012",
      employment_type: "FullTime",
      department: "Product Engineering",
      locations: ["Berlin"],
    },
  },
  {
    id: "greenhouse-job-001",
    sourceSystem: "greenhouse",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    contractHint: "job-posting-v1",
    summary: "Senior Data Engineer",
    payload: {
      id: 7654321,
      name: "Senior Data Engineer",
      status: "open",
      departments: [
        {
          id: 101,
          name: "Data Platform",
        },
      ],
      offices: [
        {
          id: 201,
          location: {
            name: "Austin, TX",
          },
        },
      ],
      created_at: "2026-01-15T09:00:00Z",
      updated_at: "2026-04-01T14:22:00Z",
    },
  },
  {
    id: "greenhouse-job-002",
    sourceSystem: "greenhouse",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    contractHint: "job-posting-v1",
    summary: "Engineering Manager, Platform",
    payload: {
      id: 7654322,
      name: "Engineering Manager, Platform",
      status: "open",
      departments: [
        {
          id: 102,
          name: "Platform Engineering",
        },
      ],
      offices: [
        {
          id: 202,
          location: {
            name: "Remote",
          },
        },
      ],
      created_at: "2026-02-10T10:30:00Z",
      updated_at: "2026-03-28T11:00:00Z",
    },
  },
  {
    id: "lever-posting-001",
    sourceSystem: "lever",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    contractHint: "job-posting-v1",
    summary: "Senior Frontend Engineer",
    payload: {
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      text: "Senior Frontend Engineer",
      state: "published",
      team: "Frontend",
      location: "Remote - Europe",
      applyUrl: "https://jobs.lever.co/example-co/a1b2c3d4",
      workplaceType: "remote",
    },
  },
  {
    id: "lever-posting-002",
    sourceSystem: "lever",
    sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
    contractHint: "job-posting-v1",
    summary: "DevOps Engineer",
    payload: {
      id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      text: "DevOps Engineer",
      state: "published",
      team: "Infrastructure",
      location: "London, UK",
      applyUrl: "https://jobs.lever.co/example-co/b2c3d4e5",
      workplaceType: "onsite",
    },
  },
];

const DEMO_FIXTURE_INDEX = new Map(DEMO_FIXTURES.map((fixture) => [fixture.id, fixture] as const));

export function listDemoFixtures(): DemoFixtureMetadata[] {
  return DEMO_FIXTURES.map(({ payload: _payload, ...metadata }) => metadata);
}

export function getDemoFixtureById(fixtureId: string): DemoFixtureDetail | undefined {
  return DEMO_FIXTURE_INDEX.get(fixtureId);
}
