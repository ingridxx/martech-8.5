import { DatabaseConfigForm } from "@/components/DatabaseConfigForm";
import { MarkdownText } from "@/components/MarkdownText";
import { OfferMap } from "@/components/OfferMap";
import { PixiMap } from "@/components/PixiMap";
import { ResetSchemaButton } from "@/components/ResetSchemaButton";
import { ConnectionConfig } from "@/data/client";
import { useConnectionState, useSchemaObjects, useTimer } from "@/data/hooks";
import {
  checkPlans,
  ensurePipelinesExist,
  estimatedRowCountObj,
  insertSeedData,
  pipelineStatus,
  runMatchingProcess,
  runUpdateSegments,
} from "@/data/queries";
import {
  configScaleFactor,
  connectionConfig,
  connectionDatabase,
} from "@/data/recoil";
import { useTimeseries } from "@/data/useTimeseries";
import { formatMs, formatNumber } from "@/format";
import {
  useNotificationsDataKey,
  useNotificationsRenderer,
} from "@/render/useNotificationsRenderer";
import { ScaleFactor } from "@/scalefactors";
import { CheckCircleIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Center,
  Container,
  Divider,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  HStack,
  IconProps,
  Input,
  SimpleGrid,
  Spinner,
  Text,
  useBoolean,
  useColorMode,
  VStack,
} from "@chakra-ui/react";
import {
  AnimatedLineSeries,
  Axis,
  darkTheme,
  lightTheme,
  Tooltip,
  XYChart,
} from "@visx/xychart";
import { RenderTooltipParams } from "@visx/xychart/lib/components/Tooltip";
import { format } from "d3-format";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import useSWR, { useSWRConfig } from "swr";

const Section = (props: {
  completed: boolean;
  title: string;
  left: ReactNode;
  right: ReactNode;
}) => {
  const { completed, title, left, right } = props;
  const { colorMode } = useColorMode();

  const colorSuffix = colorMode === "light" ? ".300" : ".500";
  const textColor = completed ? "gray" + colorSuffix : undefined;
  const iconColor = (completed ? "green" : "gray") + colorSuffix;

  const iconProps: IconProps = {
    boxSize: 6,
    position: "relative",
    bottom: 0.5,
    mr: 2,
  };

  return (
    <>
      <GridItem>
        <Heading as="h2" size="lg" mb={4} color={textColor}>
          <CheckCircleIcon color={iconColor} {...iconProps} />
          {title}
        </Heading>
        {left}
      </GridItem>
      <GridItem>{right}</GridItem>
    </>
  );
};

const ConnectionSection = ({ connected }: { connected: boolean }) => {
  return (
    <Section
      completed={connected}
      title="Connect to SingleStore"
      left={
        <MarkdownText>
          {`
            This demo requires a connection to SingleStore's HTTP API. Please
            ensure the connection details on the right are correct.
            
            **Note**: The HTTP API may need to be enabled on your SingleStore
            cluster. To do so please see [our documentation][1] or contact
            support for assistance.
            
            [1]: https://docs.singlestore.com/docs/http-api/
          `}
        </MarkdownText>
      }
      right={<DatabaseConfigForm />}
    />
  );
};

const SchemaSection = ({ initialized }: { initialized: boolean }) => {
  const [database, setDatabase] = useRecoilState(connectionDatabase);
  const schemaObjs = useSchemaObjects();
  const { colorMode } = useColorMode();

  return (
    <Section
      completed={initialized}
      title="Setup the schema"
      left={
        <>
          <MarkdownText>
            {`
              Our schema includes the database and a set of tables and views we
              need to store all of our data. Use the controls below to set the
              database name and create the schema.
            `}
          </MarkdownText>
          <Divider mt={4} mb={6} />
          <HStack alignItems="flex-end">
            <FormControl flex={1}>
              <FormLabel
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
              >
                Database name
              </FormLabel>
              <Input
                placeholder="s2cellular"
                value={database}
                size="sm"
                onChange={(e) => setDatabase(e.target.value)}
              />
            </FormControl>
            <Box flex={1} textAlign="center">
              <ResetSchemaButton
                colorScheme="blue"
                size="sm"
                disabled={initialized}
                includeSeedData={false}
              >
                {initialized ? "Schema is setup" : "Setup schema"}
              </ResetSchemaButton>
            </Box>
          </HStack>
        </>
      }
      right={
        <SimpleGrid columns={[1, 2, 2]} gap={1}>
          {Object.keys(schemaObjs.data || {})
            .sort()
            .map((name) => (
              <GridItem
                key={name}
                bg={
                  (schemaObjs.data?.[name] ? "green" : "gray") +
                  (colorMode === "light" ? ".200" : ".600")
                }
                color={colorMode === "light" ? "gray.800" : "gray.100"}
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                overflow="hidden"
                borderRadius="md"
                px={2}
                py={1}
                textAlign="center"
              >
                {name}
              </GridItem>
            ))}
        </SimpleGrid>
      }
    />
  );
};

const usePipelineStatus = (
  config: ConnectionConfig,
  scaleFactor: ScaleFactor,
  enabled = true
) => {
  const pipelines = useSWR(
    ["pipelineStatus", config, scaleFactor],
    () => pipelineStatus(config, scaleFactor),
    { isPaused: () => !enabled }
  );
  const completed = !!pipelines.data?.every((p) => !p.needsUpdate);
  return { pipelines, completed };
};

const PipelinesSection = () => {
  const { colorMode } = useColorMode();
  const config = useRecoilValue(connectionConfig);
  const scaleFactor = useRecoilValue(configScaleFactor);
  const { pipelines, completed } = usePipelineStatus(config, scaleFactor);

  const [working, workingCtrl] = useBoolean();

  const onEnsurePipelines = useCallback(async () => {
    workingCtrl.on();
    await ensurePipelinesExist(config, scaleFactor);
    pipelines.mutate();
    workingCtrl.off();
  }, [workingCtrl, config, scaleFactor, pipelines]);

  const data = useTimeseries({
    name: "estimatedRowCount",
    fetcher: useCallback(
      () => estimatedRowCountObj(config, "locations", "requests", "purchases"),
      [config]
    ),
    limit: 30,
    intervalMS: 1000,
  });

  const emptyChart =
    data.length < 2 ||
    data.every((d) => d.locations + d.purchases + d.requests === 0);

  const ensurePipelinesButton = (
    <Button
      colorScheme="blue"
      size="sm"
      onClick={onEnsurePipelines}
      disabled={completed}
    >
      {(working || completed) && <Spinner mr={2} />}
      {working
        ? "Creating Pipelines"
        : completed
        ? "...waiting for data"
        : "Create pipelines"}
    </Button>
  );

  const renderTooltip = useCallback(
    ({ tooltipData, colorScale }: RenderTooltipParams<typeof data[0]>) => {
      if (!colorScale || !tooltipData) {
        return null;
      }
      return Object.keys(tooltipData.datumByKey)
        .sort(
          (a, b) =>
            // @ts-expect-error visx doesn't allow us to easily ensure that key matches here
            tooltipData.datumByKey[b].datum[b] -
            // @ts-expect-error visx doesn't allow us to easily ensure that key matches here
            tooltipData.datumByKey[a].datum[a]
        )
        .map((key) => {
          const { datum } = tooltipData.datumByKey[key];
          // @ts-expect-error visx doesn't allow us to easily ensure that key matches here
          const value = datum[key] as number;
          return (
            <Text mb={1} key={key} color={colorScale(key)} fontSize="sm">
              {key}: {format(".4~s")(value)}
            </Text>
          );
        });
    },
    []
  );

  const chart = (
    <XYChart
      height={220}
      xScale={{ type: "time" }}
      yScale={{ type: "sqrt", nice: true }}
      theme={colorMode === "light" ? lightTheme : darkTheme}
    >
      <Axis orientation="bottom" numTicks={5} />
      <Axis orientation="right" numTicks={3} tickFormat={format("~s")} />
      <AnimatedLineSeries
        dataKey="locations"
        data={data}
        xAccessor={(datum) => datum?.ts}
        yAccessor={(datum) => datum?.locations}
      />
      <AnimatedLineSeries
        dataKey="requests"
        data={data}
        xAccessor={(datum) => datum?.ts}
        yAccessor={(datum) => datum?.requests}
      />
      <AnimatedLineSeries
        dataKey="purchases"
        data={data}
        xAccessor={(datum) => datum?.ts}
        yAccessor={(datum) => datum?.purchases}
      />
      <Tooltip
        showVerticalCrosshair
        detectBounds={false}
        renderTooltip={renderTooltip}
      />
    </XYChart>
  );

  return (
    <Section
      completed={completed}
      title="Ingest data"
      left={
        <MarkdownText>
          {`
            S2 Cellular needs location, request, and purchase history from each
            of it's subscribers in real time. We will simulate these streams by
            using [SingleStore Pipelines][1] to ingest data from [AWS S3][2].

            [1]: https://docs.singlestore.com/managed-service/en/load-data/about-loading-data-with-pipelines/pipeline-concepts/overview-of-pipelines.html
            [2]: https://aws.amazon.com/s3/
          `}
        </MarkdownText>
      }
      right={
        emptyChart ? <Center h={220}>{ensurePipelinesButton}</Center> : chart
      }
    />
  );
};

const useTableCounts = (config: ConnectionConfig, enabled = true) =>
  useSWR(
    ["overviewTableCounts", config],
    () =>
      estimatedRowCountObj(
        config,
        "locations",
        "notifications",
        "offers",
        "purchases",
        "requests",
        "segments",
        "subscriber_segments",
        "subscribers"
      ),
    { isPaused: () => !enabled }
  );

const OffersSection = () => {
  const config = useRecoilValue(connectionConfig);
  const [working, workingCtrl] = useBoolean();
  const tableCounts = useTableCounts(config);

  const onSeedData = useCallback(async () => {
    workingCtrl.on();
    await insertSeedData(config);
    tableCounts.mutate();
    workingCtrl.off();
  }, [config, tableCounts, workingCtrl]);

  const done = !!tableCounts.data?.offers;

  return (
    <Section
      completed={done}
      title="Offers"
      left={
        <>
          <MarkdownText>
            {`
              S2 Cellular allows any company to place offers. Each offer has a
              maximum bid price, activation zone, list of segments, and
              notification content. As subscribers move around, they are
              continuously matched to offers based on their location and
              whichever segments they are members of. If multiple offers match
              the offer with the highest bid price will be selected.
            `}
            {!done &&
              `
                Press the "load offers" button on the right to create some
                sample offers in New York City.
            `}
            {done &&
              `
                The map to your right displays a polygon representing each
                offer's activation zone. Hover over a polygon to see it's exact
                boundary. There are ${tableCounts.data?.offers} offers in the database.
            `}
          </MarkdownText>
        </>
      }
      right={
        !done ? (
          <Center h="100%">
            <Button onClick={onSeedData} disabled={working}>
              {working && <Spinner mr={2} />}
              {working ? "loading..." : done ? "loaded offers!" : "load offers"}
            </Button>
          </Center>
        ) : (
          <OfferMap height={300} defaultZoom={11} />
        )
      }
    />
  );
};

const WarmupSection = ({
  done,
  setDone,
}: {
  done: boolean;
  setDone: (done: boolean) => void;
}) => {
  const config = useRecoilValue(connectionConfig);

  useEffect(() => {
    if (done) {
      return;
    }

    const ctx = new AbortController();
    const cfgWithCtx = { ...config, ctx };

    (async () => {
      try {
        const startTime = performance.now();
        await runUpdateSegments(cfgWithCtx);
        await runMatchingProcess(cfgWithCtx, "second");
        const duration = performance.now() - startTime;
        if (duration < 1000 || !(await checkPlans(cfgWithCtx))) {
          return;
        }

        for (let i = 0; i < 10; i++) {
          await runUpdateSegments(cfgWithCtx);
          await runMatchingProcess(cfgWithCtx, "second");

          if (i > 1 && !(await checkPlans(cfgWithCtx))) {
            return;
          }
        }
      } catch (e) {
        if (ctx.signal.aborted) {
          return;
        }
        if (e instanceof DOMException && e.name === "AbortError") {
          return;
        }
        throw e;
      }
    })().then(() => setDone(true));

    return () => {
      ctx.abort();
    };
  }, [config, done, setDone]);

  return done ? null : (
    <GridItem colSpan={[1, 1, 2]}>
      <Center w="100%" h="200px" color="gray.500">
        <Spinner size="md" mr={4} />
        <Heading size="md">Warming up queries...</Heading>
      </Center>
    </GridItem>
  );
};

const SegmentationSection = () => {
  const config = useRecoilValue(connectionConfig);
  const tableCounts = useTableCounts(config);
  const { elapsed, isRunning, startTimer, stopTimer } = useTimer();

  const done = !!tableCounts.data?.subscriber_segments;

  const onClick = useCallback(async () => {
    startTimer();
    await runUpdateSegments(config);
    stopTimer();

    tableCounts.mutate();
  }, [config, tableCounts, startTimer, stopTimer]);

  let workEstimate;
  if (elapsed && tableCounts.data) {
    const { segments, subscriber_segments, locations, requests, purchases } =
      tableCounts.data;
    const durationFormatted = formatMs(elapsed);
    const estRows = formatNumber(locations + requests + purchases);
    const seg = formatNumber(segments);
    const memberships = formatNumber(subscriber_segments);
    workEstimate = (
      <MarkdownText>
        {`
          The last update evaluated ${estRows} rows against ${seg} segments
          producing ${memberships} segment memberships.
          
          **This process took ${durationFormatted}**.
        `}
      </MarkdownText>
    );
  }

  return (
    <Section
      completed={done}
      title="Segmentation"
      left={
        <MarkdownText>
          {`
            As mentioned above, each offer includes a list of segments. A
            segment is defined by a simple rule like "bought a coffee in the
            last day" or "visited the grocery store in the last week". While we
            could evaluate all of the segments dynamically when matching offers
            to subscribers, we would be wasting a lot of compute time since
            segment memberships don't change very often. Instead we will
            use a routine to periodically cache the mapping between subscribers
            and segments.

            Click the button to run the update interactively, or run the following query in your favorite SQL client:

                select * from dynamic_subscriber_segments;
          `}
        </MarkdownText>
      }
      right={
        <Center h="100%">
          <VStack gap={4} textAlign="center">
            <Button disabled={isRunning} onClick={onClick}>
              {isRunning && <Spinner mr={2} />}
              {isRunning ? "...running" : "Match subscribers to segments"}
            </Button>
            {workEstimate}
          </VStack>
        </Center>
      }
    />
  );
};

const MatchingSection = () => {
  const config = useRecoilValue(connectionConfig);
  const tableCounts = useTableCounts(config);
  const notificationsDataKey = useNotificationsDataKey();
  const { mutate: swrMutate } = useSWRConfig();

  const { elapsed, isRunning, startTimer, stopTimer } = useTimer();
  const [sentNotifications, setSentNotifications] = useState(0);

  const done = !!tableCounts.data?.notifications;

  const onClick = useCallback(async () => {
    startTimer();
    setSentNotifications(await runMatchingProcess(config, "second"));
    stopTimer();

    tableCounts.mutate();
    swrMutate(notificationsDataKey);
  }, [
    config,
    startTimer,
    stopTimer,
    tableCounts,
    swrMutate,
    notificationsDataKey,
  ]);

  let workEstimate;
  if (elapsed && tableCounts.data) {
    const { offers, subscribers, subscriber_segments, notifications } =
      tableCounts.data;
    const estRows = formatNumber(offers * subscribers + notifications);
    const memberships = formatNumber(subscriber_segments);
    const durationFormatted = formatMs(elapsed);
    const sentNotifs = formatNumber(sentNotifications);
    workEstimate = (
      <MarkdownText>
        {`
          The last update evaluated up to ${estRows} notification opportunities
          against ${memberships} segment memberships generating ${sentNotifs}
          notifications. This process took ${durationFormatted}.
        `}
      </MarkdownText>
    );
  }

  return (
    <Section
      completed={done}
      title="Matching"
      left={
        <MarkdownText>
          {`
            Now that we have offers and have assigned subscribers to segments,
            we are finally able to send notifications to subscriber's devices.
            In this demo, rather than actually sending notifications we will
            insert them into a table called "notifications".

            Note that quickly generating notifications multiple times will
            sometimes send zero notifications. This is expected behavior in
            order to not to spam subscribers.

            Click the button to generate notifications interactively, or run the
            following query in your favorite SQL client:

                select * from match_offers_to_subscribers("second");
          `}
        </MarkdownText>
      }
      right={
        <Center h="100%">
          <VStack gap={4} w="100%">
            <Button disabled={isRunning} onClick={onClick}>
              {isRunning && <Spinner mr={2} />}
              {isRunning ? "...running" : "Generate notifications"}
            </Button>
            <Box width="100%">
              <PixiMap
                height={250}
                defaultZoom={11}
                useRenderer={useNotificationsRenderer}
              />
            </Box>
            {workEstimate}
          </VStack>
        </Center>
      }
    />
  );
};

const SummarySection = () => {
  return (
    <Section
      completed={true}
      title="Putting it all together"
      left={
        <MarkdownText>
          {`
            Nice job! At this point you are ready to step into the shoes of a S2
            Cellular data engineer. Here are some recommendations on what to do next:

            * Visit the [live demo dashboard][1]
            * Explore the s2cellular database in SingleStore Studio

            [1]: map
          `}
        </MarkdownText>
      }
      right={null}
    />
  );
};

export const Overview = () => {
  const config = useRecoilValue(connectionConfig);
  const scaleFactor = useRecoilValue(configScaleFactor);
  const { connected, initialized } = useConnectionState();
  const { completed: pipelinesCompleted } = usePipelineStatus(
    config,
    scaleFactor,
    connected && initialized
  );
  const { data: tableCounts } = useTableCounts(
    config,
    connected && initialized
  );
  const [warmupDone, setWarmupDone] = useState(false);

  const sectionDefinitions = [
    {
      completed: connected,
      component: <ConnectionSection key="connection" connected={connected} />,
    },
    {
      completed: initialized,
      component: <SchemaSection key="schema" initialized={initialized} />,
    },
    {
      completed: pipelinesCompleted,
      component: <PipelinesSection key="pipelines" />,
    },
    {
      completed: tableCounts ? tableCounts.offers > 0 : false,
      component: <OffersSection key="offers" />,
    },
    {
      completed: warmupDone,
      component: (
        <WarmupSection key="warmup" done={warmupDone} setDone={setWarmupDone} />
      ),
    },
    {
      completed: tableCounts ? tableCounts.subscriber_segments > 0 : false,
      component: <SegmentationSection key="segmentation" />,
    },
    {
      completed: tableCounts ? tableCounts.notifications > 0 : false,
      component: <MatchingSection key="matching" />,
    },
    {
      completed: true,
      component: <SummarySection key="summary" />,
    },
  ];

  let lastCompleted = true;
  const sections = [];
  for (const { completed, component } of sectionDefinitions) {
    if (lastCompleted) {
      sections.push(component);
      lastCompleted = completed;
    } else {
      break;
    }
  }

  return (
    <Container maxW="container.lg" mt={10} mb="30vh">
      <Box maxW="container.md" mb={10} px={0}>
        <MarkdownText>
          {`
            ## Welcome to S2 Cellular!

            S2 Cellular is a hypothetical telecom company which provides free
            cell-phone plans in exchange for delivering targeted ads to
            subscribers. To do this, S2 Cellular collects location, browser, and
            purchase history from devices and stores it in SingleStore. Before we
            can deliver ads, we need to place subscribers in segments via
            comparing their history against segments our advertisers care about.
            Finally, we use geospatial indexes along with segments to deliver ads
            to devices as they move around the world.

            This page will take you through the process of setting up the demo,
            explaining everything as we go. If you have any questions or issues, please
            file an issue on the [GitHub repo][1] or our [forums][2].

            [1]: https://github.com/singlestore-labs/demo-s2cellular
            [2]: https://www.singlestore.com/forum/
          `}
        </MarkdownText>
      </Box>
      <Grid
        columnGap={6}
        rowGap={10}
        templateColumns={["minmax(0, 1fr)", null, "repeat(2, minmax(0, 1fr))"]}
      >
        {sections}
      </Grid>
    </Container>
  );
};
