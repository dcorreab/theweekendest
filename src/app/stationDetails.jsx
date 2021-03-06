import React from 'react';
import ReactDOM from 'react-dom';
import { Responsive, Button, Icon, Header, Segment, List, Popup } from "semantic-ui-react";
import { Link, withRouter } from "react-router-dom";
import Clipboard from 'react-clipboard.js';
import { Helmet } from "react-helmet";
import * as Cookies from 'es-cookie';

import OverlayControls from './overlayControls.jsx';
import TrainBullet from './trainBullet.jsx';

import Cross from "./icons/cross-15.svg";

// M train directions are reversed between Essex St and Myrtle Av to match with J/Z trains
const M_TRAIN_SHUFFLE = ["M18", "M16", "M14", "M13", "M12", "M11"];

const STATIONS_EXEMPT_FROM_UPTOWN_DOWNTOWN_DIRECTIONS = new Set(
  ['901', '902', '723', '724', '725', '726', 'L06', 'L05', 'L03', 'L02', 'L01']
);
const STATIONS_EXEMPT_FROM_SOUTH_DIRECTIONS = new Set(
  ['M18']
);

const BOROUGHS = {
  "M": "Manhattan",
  "Bx": "The Bronx",
  "Bk": "Brooklyn",
  "Q": "Queens",
  "SI": "Staten Island"
}

class StationDetails extends React.Component {
  constructor(props) {
    super(props);
    this.state = { fav: false };
  }

  componentDidMount() {
    const { station, handleOnMount, infoBox, handleDisplayTrainPositionsToggle } = this.props;
    const favs = Cookies.get('favs') && Cookies.get('favs').split(",");

    if (!favs || !favs.includes(station.id)) {
      this.setState({ fav: false });
    } else {
      this.setState({ fav: true });
    }

    handleOnMount(station.id);
    infoBox.classList.add('open');
    infoBox.scrollTop = 0;
  }

  componentDidUpdate(prevProps) {
    const { handleOnMount, station, infoBox, handleDisplayTrainPositionsToggle } = this.props;
    if (prevProps.station.id !== station.id) {
      handleOnMount(station.id);
      infoBox.classList.add('open');
      infoBox.scrollTop = 0;

    }
  }

  statusColor(status) {
    if (status == 'Good Service') {
      return 'green';
    } else if (status == 'Service Change') {
      return 'orange';
    } else if (status == 'Not Good') {
      return 'yellow';
    } else if (status == 'Delay') {
      return 'red';
    }
  }

  handleBack = _ => {
    this.props.history.goBack();
  }

  handleHome = _ => {
    this.props.handleResetMap();
  }

  handleShare = _ => {
    const { station } = this.props;
    const name = `${ station.name.replace(/ - /g, "–") }${ station.secondary_name ? ` (${station.secondary_name})` : ""}`;
    navigator.share({
      title: `the weekendest beta - ${name} Station`,
      url: `https://www.theweekendest.com/stations/${station.id}`
    });
  }

  handleStar = _ => {
    const { station } = this.props;
    const { fav } = this.state;
    const newState = !fav;
    const currentFavs = new Set(Cookies.get('favs') && Cookies.get('favs').split(","));

    if (newState) {
      currentFavs.add(station.id);
    } else {
      currentFavs.delete(station.id);
    }

    this.setState({ fav: newState });
    Cookies.set('favs', [...currentFavs].join(","), {expires: 365});

    gtag('event', 'stars', {
      'event_category': newState ? 'add' : 'remove',
      'event_label': station.id
    });
  }

  handleRealignMap = _ => {
    const { handleOnMount, station } = this.props;
    handleOnMount(station.id);
  }

  renderArrivalTimes(trainId, direction) {
    const { station, arrivals, routings, stations } = this.props;
    const currentTime = Date.now() / 1000;
    let actualDirection = direction;

    if (trainId === 'M' && M_TRAIN_SHUFFLE.includes(station.id)) {
      actualDirection = direction === "north" ? "south" : "north";
    }

    if (!arrivals[trainId] || !arrivals[trainId].trains[actualDirection]) {
      return;
    }

    const destinations = new Set();
    const trainRoutingInfo = routings[trainId];

    trainRoutingInfo.routings[actualDirection].forEach((routing) => {
      if (routing.includes(station.id + actualDirection[0].toUpperCase())) {
        destinations.add(routing[routing.length - 1]);
      }
    })

    const destinationsArray = Array.from(destinations);

    const times = arrivals[trainId].trains[actualDirection].filter((train) => {
      return train.arrival_times.some((estimate) => estimate.stop_id.substr(0, 3) === station.id && estimate.estimated_time >= (currentTime - 59))
    }).map((train) => {
      return {
        id: train.id,
        time: Math.round((train.arrival_times.find((estimate) => estimate.stop_id.substr(0, 3) === station.id).estimated_time  - currentTime) / 60),
        destination: train.arrival_times[train.arrival_times.length - 1].stop_id.substr(0, 3)
      }
    }).sort((a, b) => a.time - b.time).slice(0, 2);

    if (times.length < 1) {
      return;
    }

    return times.map((estimate) => {
      const runDestination = stations[estimate.destination.substr(0, 3)].name.replace(/ - /g, "–");
      const timeText = estimate.time < 1 ? "Due" : `${estimate.time} min`;
      if (destinationsArray.length > 1 || estimate.destination !== destinationsArray[0].substr(0, 3)) {
        const runDestinationShort = runDestination.split('–')[0];
        return (
          <Link to={`/trains/${trainId}/${estimate.id.replace('..', '-')}`} key={estimate.id} title={`${trainId} Train ID: ${estimate.id} to ${runDestination}`}>
            {timeText} ({runDestinationShort})
          </Link>
        );
      }
      return (
        <Link to={`/trains/${trainId}/${estimate.id.replace('..', '-')}`} key={estimate.id} title={`${trainId} Train ID: ${estimate.id} to ${runDestination}`}>
          {timeText}
        </Link>);
    }).reduce((prev, curr) => [prev, ', ', curr]);
  }

  southDestinations() {
    const { routings, station } = this.props;
    let destinations = [];
    Object.keys(routings).forEach((key) => {
      const route = routings[key];
      if (key !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) {
        route.routings.south.forEach((routing) => {
          if (routing.includes(station.id + "S")) {
            destinations.push(routing[routing.length - 1]);
          }
        })
      }
    })

    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      const route = routings["M"];
      route.routings.north.forEach((routing) => {
        if (routing.includes(station.id + "N")) {
          destinations.push(routing[routing.length - 1]);
        }
      })
    }

    return this.sortDestinations(destinations);
  }

  southDirection() {
    const { routings, stations, station } = this.props;
    const currentBorough = station.borough;

    if (STATIONS_EXEMPT_FROM_SOUTH_DIRECTIONS.has(station.id)) {
      return;
    }

    let manhattanDirection = null;
    let adjacentBoroughs = new Set();
    Object.keys(routings).forEach((key) => {
      const route = routings[key];
      if (key !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) {
        route.routings.south.forEach((routing) => {
          if (routing.includes(station.id + "S")) {
            routing.slice(routing.indexOf(station.id + "S") + 1).forEach((stationId) => {
              const s = stations[stationId.substr(0, 3)];
              if (s.borough !== currentBorough) {
                adjacentBoroughs.add(s.borough);
              } else {
                if (['M', 'Bx'].includes(currentBorough) && !STATIONS_EXEMPT_FROM_UPTOWN_DOWNTOWN_DIRECTIONS.has(station.id)) {
                  if (s.latitude < station.latitude) {
                    manhattanDirection = "Downtown";
                  }
                }
              }
            });
          }
        })
      }
    })

    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      const route = routings["M"];
      route.routings.north.forEach((routing) => {
        if (routing.includes(station.id + "N")) {
          routing.slice(routing.indexOf(station.id + "N") + 1).forEach((stationId) => {
            const s = stations[stationId.substr(0, 3)];
            if (s.borough !== currentBorough) {
              adjacentBoroughs.add(s.borough);
            }
          });
        }
      })
    }

    const adjacentBoroughsArray = Array.from(adjacentBoroughs).map((b) => BOROUGHS[b] || b);

    if (manhattanDirection) {
      adjacentBoroughsArray.unshift(manhattanDirection);
    }

    if (adjacentBoroughsArray.length === 0) {
      return;
    }

    return [
      adjacentBoroughsArray.slice(0, -1).join(', '),
      adjacentBoroughsArray.slice(-1)[0]
    ].join(adjacentBoroughsArray.length < 2 ? '' : ' & ') + "—\n" ;
  }

  southStops() {
    const { station } = this.props;

    let results = Array.from(station.southStops);
    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      results = results.filter((t) => t !== 'M');

      if (station.northStops.has('M')) {
        results.push('M');
      }
    }
    return results;
  }

  northDestinations() {
    const { routings, station } = this.props;
    let destinations = [];
    Object.keys(routings).forEach((key) => {
      const route = routings[key];
      if (key !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) {
        route.routings.north.forEach((routing) => {
          if (routing.includes(station.id + "N")) {
            destinations.push(routing[routing.length - 1]);
          }
        })
      }
    })

    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      const route = routings["M"];
      route.routings.south.forEach((routing) => {
        if (routing.includes(station.id + "S")) {
          destinations.push(routing[routing.length - 1]);
        }
      })
    }

    return this.sortDestinations(destinations);
  }

  northDirection() {
    const { routings, stations, station } = this.props;
    const currentBorough = station.borough;
    let manhattanDirection = null;
    let adjacentBoroughs = new Set();
    Object.keys(routings).forEach((key) => {
      const route = routings[key];
      if (key !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) {
        route.routings.north.forEach((routing) => {
          if (routing.includes(station.id + "N")) {
            routing.slice(routing.indexOf(station.id + "N") + 1).forEach((stationId) => {
              const s = stations[stationId.substr(0, 3)];
              if (s.borough !== currentBorough) {
                adjacentBoroughs.add(s.borough);
              } else {
                if (['M', 'Bx'].includes(currentBorough) && !STATIONS_EXEMPT_FROM_UPTOWN_DOWNTOWN_DIRECTIONS.has(station.id)) {
                  if (s.latitude > station.latitude) {
                    manhattanDirection = "Uptown";
                  }
                }
              }
            });
          }
        })
      }
    })

    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      const route = routings["M"];
      route.routings.south.forEach((routing) => {
        if (routing.includes(station.id + "S")) {
          routing.slice(routing.indexOf(station.id + "S") + 1).forEach((stationId) => {
            const s = stations[stationId.substr(0, 3)];
            if (s.borough !== currentBorough) {
              adjacentBoroughs.add(s.borough);
            }
          });
        }
      })
    }

    const adjacentBoroughsArray = Array.from(adjacentBoroughs).map((b) => BOROUGHS[b] || b);

    if (manhattanDirection) {
      adjacentBoroughsArray.unshift(manhattanDirection);
    }

    if (adjacentBoroughsArray.length === 0) {
      return;
    }

    return [
      adjacentBoroughsArray.slice(0, -1).join(', '),
      adjacentBoroughsArray.slice(-1)[0]
    ].join(adjacentBoroughsArray.length < 2 ? '' : ' & ') + "—\n" ;
  }

  northStops() {
    const { station } = this.props;

    let results = Array.from(station.northStops);
    if (M_TRAIN_SHUFFLE.includes(station.id)) {
      results = results.filter((t) => t !== 'M');

      if (station.southStops.has('M')) {
        results.push('M');
      }
    }
    return results;
  }

  sortDestinations(destinations) {
    const { stations } = this.props;

    if (destinations.length === 0) {
      return;
    }

    return Array.from(new Set(destinations)).sort((a, b) => {
      const first = stations[a.substring(0, 3)].name;
      const second = stations[b.substring(0, 3)].name;

      if (first < second) { return -1; }
      if (first > second) { return 1; }
      return 0;
    }).map((s) => {
      const st = stations[s.substring(0, 3)];
      if (st) {
        return (
          <Link to={`/stations/${st.id}`} key={st.id}>
            { st.name.replace(/ - /g, "–") }
          </Link>
        );
      }
    }).reduce((prev, curr) => [prev, ', ', curr]);
  }

  renderOverlayControls() {
    const { displayProblems, displayDelays, displaySlowSpeeds, displayLongHeadways, displayTrainPositions,
      handleDisplayProblemsToggle, handleDisplayDelaysToggle, handleDisplaySlowSpeedsToggle, handleDisplayLongHeadwaysToggle,
      handleDisplayTrainPositionsToggle } = this.props;
    return (
      <Popup trigger={<Button icon='sliders horizontal' title="Configure overlays" />}
            on='click' hideOnScroll position='bottom center' style={{maxWidth: "195px"}}>
        <OverlayControls displayProblems={displayProblems} displayDelays={displayDelays} displaySlowSpeeds={displaySlowSpeeds}
            displayLongHeadways={displayLongHeadways} displayTrainPositions={displayTrainPositions}
            handleDisplayProblemsToggle={handleDisplayProblemsToggle}
            handleDisplayDelaysToggle={handleDisplayDelaysToggle} handleDisplaySlowSpeedsToggle={handleDisplaySlowSpeedsToggle}
            handleDisplayLongHeadwaysToggle={handleDisplayLongHeadwaysToggle}
            handleDisplayTrainPositionsToggle={handleDisplayTrainPositionsToggle}
            alwaysExpand={true} />
      </Popup>
    )
  }

  render() {
    const { stations, station, trains } = this.props;
    const { fav } = this.state;
    const name = `${ station.name.replace(/ - /g, "–") }${ station.secondary_name ? ` (${station.secondary_name})` : ""}`;
    const title = `the weekendest beta - ${name} Station`;
    return (
      <Segment className='details-pane'>
        <Helmet>
          <title>{title}</title>
          <meta property="og:title" content={`${name} Station`} />
          <meta name="twitter:title" content={title} />
          <meta property="og:url" content={`https://www.theweekendest.com/stations/${station.id}`} />
          <meta name="twitter:url" content={`https://www.theweekendest.com/stations/${station.id}`} />
          <meta property="og:description" content={`Check service status, and real-time train arrival times for ${name} Station on the New York City subway.`} />
          <meta name="twitter:description" content={`Check service status, and real-time train arrival times for ${name} Station on the New York City subway.`} />
          <link rel="canonical" href={`https://www.theweekendest.com/stations/${station.id}`} />
          <meta name="Description" content={`Check service status, and real-time train arrival times for ${name} Station on the New York City subway.`} />
        </Helmet>
        <Responsive minWidth={Responsive.onlyTablet.minWidth} as='div' style={{padding: "14px"}}>
          <Button icon onClick={this.handleBack} title="Back">
            <Icon name='arrow left' />
          </Button>
          <Button icon onClick={this.handleHome} title="Home">
            <Icon name='map outline' />
          </Button>
          <Button icon title="Center map" onClick={this.handleRealignMap}>
            <Icon name='crosshairs' />
          </Button>
          {
            this.renderOverlayControls()
          }
          <Button icon onClick={this.handleStar} title={ fav ? 'Remove station from favorites' : 'Add station to favorites'}>
            <Icon name={ fav ? 'star' : 'star outline'} />
          </Button>
          { navigator.share &&
            <Button icon onClick={this.handleShare} style={{float: "right"}} title="Share">
              <Icon name='external share' />
            </Button>
          }
          <Clipboard component={Button} style={{float: "right"}} className="icon" title="Copy Link" data-clipboard-text={`https://www.theweekendest.com/stations/${this.props.station.id}`}>
            <Icon name='linkify' />
          </Clipboard>
          <Header as="h3" className='header-station-name'>
            { station.name.replace(/ - /g, "–") }
          </Header>
          { station.secondary_name &&
            <span className='header-secondary-name'>
              {
                station.secondary_name
              }
            </span>
          }
        </Responsive>
        <Responsive {...Responsive.onlyMobile} as='div' className="mobile-details-header">
          <Popup trigger={<Button icon='ellipsis horizontal' title="More Options..." />} inverted flowing
            on='click' hideOnScroll position='bottom left'>
            <Button icon onClick={this.handleBack} title="Back">
              <Icon name='arrow left' />
            </Button>
            <Button icon onClick={this.handleHome} title="Home">
              <Icon name='map outline' />
            </Button>
            {
              this.renderOverlayControls()
            }
            <Button icon onClick={this.handleStar} title={ fav ? 'Remove station from favorites' : 'Add station to favorites'}>
              <Icon name={ fav ? 'star' : 'star outline'} />
            </Button>
            <Clipboard component={Button} className="icon" title="Copy Link" data-clipboard-text={`https://www.theweekendest.com/stations/${this.props.station.id}`}>
              <Icon name='linkify' />
            </Clipboard>
            { navigator.share &&
              <Button icon onClick={this.handleShare} title="Share">
                <Icon name='external share' />
              </Button>
            }
          </Popup>
          <Header as="h5" style={{margin: 0, flexGrow: 1, maxHeight: "36px", overflow: "hidden"}}>
            { station.name.replace(/ - /g, "–") }
            <span className='header-secondary-name'>
              { station.secondary_name }
            </span>
          </Header>
          <Button icon title="Center map" onClick={this.handleRealignMap}>
            <Icon name='crosshairs' />
          </Button>
        </Responsive>
        <div className="details-body">
          <Segment>
            <Header as="h5" style={{whiteSpace: "pre-line"}}>
              { this.southDirection() }To { this.southDestinations() }
            </Header>
            <div>
              <List divided relaxed>
                {
                  this.southStops().sort().map((trainId) => {
                    const train = trains.find((t) => {
                      return t.id === trainId;
                    });
                    return (
                      <List.Item key={trainId}>
                        <List.Content floated='left' style={{marginRight: "0.5em"}}>
                          <TrainBullet name={train.name} id={trainId} color={train.color}
                            textColor={train.text_color} size='small' link />
                        </List.Content>
                        <List.Content floated='right' className="station-details-route-status">
                          <Header as="h5">
                            { this.renderArrivalTimes(trainId, "south") }
                          </Header>
                          {
                            (trainId !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) &&
                            <a href={`https://www.goodservice.io/trains/${trainId}/status`} target="_blank">
                              <Header as='h4' color={this.statusColor(train.direction_statuses.south)}>
                                { train.direction_secondary_statuses.south }
                              </Header>
                            </a>
                          }
                          {
                            trainId === 'M' && M_TRAIN_SHUFFLE.includes(station.id) &&
                            <a href={`https://www.goodservice.io/trains/${trainId}/status`} target="_blank">
                              <Header as='h4' color={this.statusColor(train.direction_statuses.north)}>
                                { train.direction_secondary_statuses.north }
                              </Header>
                            </a>
                          }
                        </List.Content>
                      </List.Item>
                    );
                  })
                }
              </List>
            </div>
          </Segment>
          <Segment>
            <Header as="h5" style={{whiteSpace: "pre-line"}}>
              { this.northDirection() }To { this.northDestinations() }
            </Header>
            <div>
              <List divided relaxed>
                {
                  this.northStops().sort().map((trainId) => {
                    const train = trains.find((t) => {
                      return t.id === trainId;
                    });
                    return (
                      <List.Item key={trainId}>
                        <List.Content floated='left'>
                          <TrainBullet name={train.name} id={trainId} color={train.color}
                            textColor={train.text_color} size='small' link />
                        </List.Content>
                        <List.Content floated='right' className="station-details-route-status">
                          <Header as="h5">
                            { this.renderArrivalTimes(trainId, "north")}
                          </Header>
                          {
                            (trainId !== 'M' || !M_TRAIN_SHUFFLE.includes(station.id)) &&
                            <a href={`https://www.goodservice.io/trains/${trainId}/status`} target="_blank">
                              <Header as='h4' color={this.statusColor(train.direction_statuses.north)}>
                                { train.direction_secondary_statuses.north }
                              </Header>
                            </a>
                          }
                          {
                            trainId === 'M' && M_TRAIN_SHUFFLE.includes(station.id) &&
                            <a href={`https://www.goodservice.io/trains/${trainId}/status`} target="_blank">
                              <Header as='h4' color={this.statusColor(train.direction_statuses.south)}>
                                { train.direction_secondary_statuses.south }
                              </Header>
                            </a>
                          }
                        </List.Content>
                      </List.Item>
                    );
                  })
                }
              </List>
            </div>
          </Segment>
          {
            station.transfers.size > 0 &&
            <Segment>
              <Header as="h4">
                Transfers
              </Header>
              <List divided relaxed selection>
              {
                Array.from(station.transfers).map((stopId) => {
                  const stop = stations[stopId];
                  if (!stop) {
                    return;
                  }
                  return(
                    <List.Item as={Link} key={stop.id} className='station-list-item' to={`/stations/${stop.id}`}>
                      <List.Content floated='left'>
                        <Header as='h5'>
                          { stop.name.replace(/ - /g, "–") }
                        </Header>
                      </List.Content>
                      { stop.secondary_name &&
                        <List.Content floated='left' className="secondary-name">
                          { stop.secondary_name }
                        </List.Content>
                      }
                      <List.Content floated='right'>
                        {
                          Array.from(stop.stops).sort().map((trainId) => {
                            const train = trains.find((t) => {
                              return t.id == trainId;
                            });
                            const directions = [];
                            if (stop.northStops.has(trainId)) {
                              directions.push("north")
                            }
                            if (stop.southStops.has(trainId)) {
                              directions.push("south")
                            }
                            return (
                              <TrainBullet id={trainId} key={train.name} name={train.name} color={train.color}
                                textColor={train.text_color} size='small' key={train.id} directions={directions} />
                            )
                          })
                        }
                        {
                          stop.stops.size === 0 &&
                          <Cross style={{height: "21px", width: "21px", margin: "3.5px 1px 3.5px 3.5px"}} />
                        }
                      </List.Content>
                    </List.Item>
                  )
                })
              }
            </List>
            </Segment>
          }
        </div>
      </Segment>
    );
  }
}

export default withRouter(StationDetails)