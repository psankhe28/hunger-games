import * as React from "react";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";

import LogoGrid from "../../components/LogoGrid";
import LogoForm from "../../components/LogoForm";
import robotoff from "../../robotoff";
import off from "../../off";
import useUrlParams from "../../hooks/useUrlParams";
import AnnotateLogoModal from "../../components/AnnotateLogoModal";

const DEFAULT_COUNT = 25;

const transformLogo = (logo) => {
  const src =
    logo.image.url ||
    robotoff.getCroppedImageUrl(
      off.getImageUrl(logo.image.source_image),
      logo.bounding_box
    );

  return { ...logo, image: { ...logo.image, src } };
};

const request = async ({ barcode, value, type, count }) => {
  const { data } = await robotoff.searchLogos(
    barcode,
    value,
    type,
    Number.parseInt(count),
    true
  );

  return {
    logos: data.logos.map(transformLogo),
    count: data.count,
  };
};

export default function LogoSearch() {
  // const [isLoading, setIsLoading] = React.useState(true);

  const [annotatedLogos, setAnnotatedLogos] = React.useState([]);
  const [logosToAnnotate, setLogosToAnnotate] = React.useState([]);
  // TODO: allows to fetch more when reaching data limit
  const [searchCount] = React.useState(DEFAULT_COUNT);
  const [searchState, setSearchState] = useUrlParams(
    { type: "", value: "" },
    {
      value: ["valueTag", "value_tag"],
    }
  );
  const pageSize = 50;
  const [page, setPage] = React.useState(1);

  const setNewSearchState = ({ type, value }) => {
    setSearchState(DEFAULT_COUNT);
    setAnnotatedLogos([]);
    setLogosToAnnotate([]);
    setSearchState({ type, value });
  };

  React.useEffect(() => {
    let isValid = true;
    const fetchMoreAnnotatedLogos = async () => {
      try {
        const { logos } = await request({
          ...searchState,
          count: searchCount,
        });
        if (!isValid) {
          return;
        }

        setAnnotatedLogos((prev) => {
          const ids = prev.map((logo) => logo.id);
          return [
            ...prev,
            ...logos
              .filter((logo) => !ids.includes(logo.id))
              .map(transformLogo),
          ];
        });
      } catch (error) {}
    };

    fetchMoreAnnotatedLogos();

    return () => {
      isValid = false;
    };
  }, [searchState, searchCount]);

  const nextLogoToFetchId = annotatedLogos.find((logo) => !logo.fetched)?.id;

  React.useEffect(() => {
    let isValid = true;
    const fetchLogosToAnnotate = async () => {
      if ((page + 1) * pageSize <= logosToAnnotate.length) {
        // We already have one page in advance
        return;
      }
      if (nextLogoToFetchId == null) {
        // no more logos to fetch
        return;
      }
      const {
        data: { results },
      } = await robotoff.getLogoAnnotations(
        JSON.stringify(nextLogoToFetchId),
        "",
        50
      );
      if (!isValid) {
        return;
      }
      const {
        data: { logos: logoImages },
      } = await robotoff.getLogosImages(results.map((r) => r.logo_id));
      if (!isValid) {
        return;
      }

      const logoId2Distance = {};
      results.forEach(({ logo_id, distance }) => {
        logoId2Distance[logo_id] = distance;
      });

      const notAnnotatedLogos = logoImages
        .filter(
          ({ annotation_type, annotation_value, annotation_value_tag }) =>
            annotation_type == null &&
            annotation_value == null &&
            annotation_value_tag == null
        )
        .map(transformLogo)
        .map((logo) => ({ ...logo, distance: logoId2Distance[logo.id] }));

      setLogosToAnnotate((prev) => {
        const seenIds = {};
        prev.forEach(({ id }) => (seenIds[id] = true));
        const alreadyVisible = prev.slice(0, page * pageSize);
        const hidden = [
          ...prev.slice(page * pageSize, prev.length),
          ...notAnnotatedLogos.filter(({ id }) => !seenIds[id]),
        ].sort((a, b) => a.distance - b.distance);

        setAnnotatedLogos((prev) =>
          prev.map((logo) =>
            logo.id === nextLogoToFetchId ? { ...logo, fetched: true } : logo
          )
        );
        return [...alreadyVisible, ...hidden];
      });
    };

    fetchLogosToAnnotate();

    return () => {
      isValid = false;
    };
  }, [logosToAnnotate.length, nextLogoToFetchId, page]);

  const toggleSelection = React.useCallback((id) => {
    setLogosToAnnotate((logos) => {
      const indexToToggle = logos.findIndex((logo) => logo.id === id);
      if (indexToToggle < 0) {
        return logos;
      }
      return [
        ...logos.slice(0, indexToToggle),
        {
          ...logos[indexToToggle],
          selected: !logos[indexToToggle].selected,
        },
        ...logos.slice(indexToToggle + 1),
      ];
    });
  }, []);

  const setRangeSelection = React.useCallback((ids, newSelectedState) => {
    setLogosToAnnotate((logos) => {
      const shouldBeSet = {};
      ids.forEach((id) => (shouldBeSet[id] = true));

      return logos.map((logo) =>
        shouldBeSet[logo.id]
          ? {
              ...logo,
              selected: newSelectedState,
            }
          : logo
      );
    });
  }, []);

  const afterAnnotation = (annotatedLogos) => {
    const annotatedIds = {};
    annotatedLogos.forEach(({ id }) => (annotatedIds[id] = true));
    setAnnotatedLogos((prev) => [...prev, ...annotatedLogos]);
    setLogosToAnnotate((prev) => {
      console.log(prev);
      return prev.filter((logo) => !annotatedIds[logo.id]);
    });
  };

  const selectAllOnPage = () => {
    setLogosToAnnotate((prev) =>
      prev.map((logo, index) => ({
        ...logo,
        selected:
          index < page * pageSize && index >= (page - 1) * pageSize
            ? true
            : logo.selected,
      }))
    );
  };

  const [isAnnotationOpen, setIsAnnotationOpen] = React.useState(false);
  const openAnnotation = React.useCallback(() => {
    setIsAnnotationOpen(true);
  }, []);
  const closeAnnotation = React.useCallback(() => {
    setIsAnnotationOpen(false);
  }, []);

  const deselectAll = () => {
    setLogosToAnnotate((prev) =>
      prev.map((logo) => ({
        ...logo,
        selected: false,
      }))
    );
  };

  return (
    <Box sx={{ padding: 2 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Logo search
      </Typography>
      <Typography variant="body1">
        Select a logo you want to look for, and let's go to catch them all. For
        every logo you annotate, we will fetch it's neighbors such that you
        might never stop to annotate. (Press Shift to select range of logos)
      </Typography>
      <Divider sx={{ my: 3 }} />
      <LogoForm {...searchState} request={setNewSearchState} />
      {/* {isLoading && <LinearProgress sx={{ mt: 5 }} />} */}

      <Typography variant="h5" sx={{ mt: 5, mb: 1 }}>
        Reference logos (logo already annotated with this value)
      </Typography>
      <LogoGrid
        logos={annotatedLogos.slice(0, 5)}
        toggleLogoSelection={null}
        readOnly
        sx={{ pt: 0 }}
      />

      <Divider sx={{ my: 3 }} />

      <Box sx={{ display: "flex", flexDirection: "row", gap: 1 }}>
        <Typography variant="h5" sx={{ mt: 5, mb: 1 }}>
          Remaining to annotate
        </Typography>
        <Button
          onClick={selectAllOnPage}
          variant="contained"
          sx={{ ml: "auto", maxHeight: 40, mt: "40px", mb: "8px" }} // to align with "Remaining to annotate"
        >
          Select All
        </Button>
        <Button
          onClick={deselectAll}
          variant="contained"
          sx={{ maxHeight: 40, mt: "40px", mb: "8px" }}
        >
          Deselect All
        </Button>
      </Box>

      <LogoGrid
        logos={logosToAnnotate.slice((page - 1) * pageSize, page * pageSize)}
        toggleLogoSelection={toggleSelection}
        setLogoSelectionRange={setRangeSelection}
        sx={{ pt: 0 }}
      />

      <Paper
        elevation={0}
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 1,
          position: "sticky",
          bottom: 0,
          py: 2,
        }}
      >
        <Button
          disabled={page === 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          variant="contained"
          sx={{ width: 200 }}
        >
          prev
        </Button>
        <Button
          fullWidth
          onClick={openAnnotation}
          color="success"
          variant="contained"
        >
          Annotate
        </Button>
        <Button
          variant="contained"
          sx={{ width: 200 }}
          onClick={() => setPage((p) => p + 1)}
          disabled={page * pageSize > logosToAnnotate.length}
        >
          next
        </Button>
      </Paper>

      <AnnotateLogoModal
        isOpen={isAnnotationOpen}
        logos={logosToAnnotate}
        closeAnnotation={closeAnnotation}
        toggleLogoSelection={toggleSelection}
        afterAnnotation={afterAnnotation}
        {...searchState}
      />
    </Box>
  );
}
