function initializeData() {
    return {
        nEvents: 0,
        stadium: null,
        isFinal: false,
        isOT: false,
        time: 0,
        timeLimit: 0,
        scoreLimit: 0,
        score: {
            red: 0,
            blue: 0,
        },
        players: {
            red: {},
            blue: {},
        },
        kicks: [],
        gainedPossessionAt: 0,
        possessor: null,
    };
}

function initializePlayer(playerMap, team, name) {
    if (!team || !name) {
        return null;
    } else if (name in playerMap[team]) {
        return playerMap[team][name];
    } else {
        return {
            team,
            name,
            goalsScored: 0,
            shotsTaken: 0,
            shotsFaced: 0,
            savesMade: 0,
            errorsAllowed: 0,
            ownGoals: 0,
            passesAttempted: 0,
            passesCompleted: 0,
            passesReceived: 0,
            stealsTaken: 0,
            stealsGiven: 0,
            timePossessed: 0,
        };
    }
}

function reduceLive(d, v, stadiums) {
    const stadium = d.stadium ? stadiums[d.stadium] || null : null;
    d.nEvents++;
    let fromPlayer = initializePlayer(d.players, v.fromTeam, v.fromName);
    let toPlayer = initializePlayer(d.players, v.toTeam, v.toName);
    // Update score and time.
    d.score.red = v.scoreRed ? v.scoreRed : d.score.red;
    d.score.blue = v.scoreBlue ? v.scoreBlue : d.score.blue;
    d.scoreLimit = v.scoreLimit ? v.scoreLimit : d.scoreLimit;
    d.timeLimit = v.timeLimit ? v.timeLimit : d.timeLimit;
    d.time = v.time ? v.time : d.time;
    d.isOT = d.time > d.timeLimit;
    // Compute kick metrics.
    if (v.type === "pass") {
        if (fromPlayer.name !== toPlayer.name) {
            fromPlayer.passesAttempted++;
            fromPlayer.passesCompleted++;
            toPlayer.passesReceived++;
        }
    }
    if (v.type === "steal") {
        fromPlayer.passesAttempted++;
        fromPlayer.stealsGiven++;
        toPlayer.stealsTaken++;
    }
    if (v.type === "goal") {
        fromPlayer.shotsTaken++;
        fromPlayer.goalsScored++;
    }
    // Only use errors to count offensive stats and correct defensive saves.
    // Use own goals to count defensive errors, as an error is always followed by an own goal,
    // but an own goal is not always preceded by an error.
    if (v.type === "error") {
        fromPlayer.goalsScored++;
        // Undo the effects of the previous save, as if it never happened.
        if (v.correction) {
            // Decrement shotsFaced so that own goal can increment it.
            toPlayer.shotsFaced--;
            toPlayer.savesMade--;
            toPlayer.errorsAllowed++;
        }
    }
    if (v.type === "own_goal") {
        fromPlayer.shotsFaced++;
        fromPlayer.ownGoals++;
    }
    if (v.type === "save") {
        fromPlayer.shotsTaken++;
        toPlayer.shotsFaced++;
        toPlayer.savesMade++;
    }
    // Save kicks to display.
    if (stadium) {
        const rgb = v.fromTeam === "red" ? `217, 3, 104` : `63, 167, 214`;
        const gpRed = stadium.goalposts[TEAMS.Red];
        const gpBlue = stadium.goalposts[TEAMS.Blue];
        if (v.type === "goal" || v.type === "error") {
            const gp = v.fromTeam === "red" ? gpBlue : gpRed;
            d.kicks.push({
                color: `rgba(${rgb}, 0.90)`,
                ...v,
                toX: gp.mid.x,
                toY: gp.mid.y,
            });
        }
        if (v.type === "own_goal") {
            const gp = v.fromTeam === "red" ? gpRed : gpBlue;
            d.kicks.push({
                color: `rgba(${rgb}, 0.90)`,
                ...v,
                toX: gp.mid.x,
                toY: gp.mid.y,
            });
        }
        if (v.type === "save") {
            d.kicks.push({
                color: `rgba(${rgb}, 0.90)`,
                ...v,
            });
        }
    }
    // Compute time of possession.
    if (fromPlayer) {
        d.possessor = d.possessor ? d.possessor : fromPlayer.name;
        const possessionDuration = v.time - d.gainedPossessionAt;
        // Even if the previous possessor is not fromPlayer, we will give fromPlayer the time.
        fromPlayer.timePossessed += possessionDuration;
        if (!toPlayer) {
            d.possessor = null;
        } else if (toPlayer.name !== fromPlayer.name) {
            d.possessor = toPlayer.name;
        }
        d.gainedPossessionAt = v.time;
    }
    // Update player entries.
    if (fromPlayer) {
        d.players[fromPlayer.team][fromPlayer.name] = fromPlayer;
    }
    if (toPlayer) {
        d.players[toPlayer.team][toPlayer.name] = toPlayer;
    }
    if (v.type === "start") {
        d.stadium = v.stadium;
    }
    if (v.type === "victory") {
        d.isFinal = true;
    }
    return d;
}

function tableOffense(playerMap) {
    const headers = [
        { key: "name", name: "Player" },
        { key: "goalsScored", name: "Goals" },
        { key: "shotsTaken", name: "Shots" },
        { key: "passes", name: "Passes" },
    ];
    const rows = toList(playerMap).map((p) => {
        return {
            name: limitChars(p.name, 20),
            goalsScored: p.goalsScored,
            shotsTaken: p.shotsTaken,
            passesCompleted: p.passesCompleted,
            passesAttempted: p.passesAttempted,
            passes: `${p.passesCompleted} / ${p.passesAttempted}`,
        }
    }).sort((a, b) => {
        if (a.goalsScored === b.goalsScored) {
            if (a.shotsTaken === b.shotsTaken) {
                if (a.passesCompleted === b.passesCompleted) {
                    return b.passesAttempted - a.passesAttempted;
                }
                return b.passesCompleted - a.passesCompleted;
            }
            return b.shotsTaken - a.shotsTaken;
        }
        return b.goalsScored - a.goalsScored;
    });
    return { headers, rows };
}

function tableDefense(playerMap) {
    const headers = [
        { key: "name", name: "Player" },
        { key: "ownGoals", name: "Own Goals" },
        { key: "saves", name: "Save Attempts" },
        { key: "stealsTaken", name: "Steals" },
    ];
    const rows = toList(playerMap).map((p) => {
        return {
            name: limitChars(p.name, 20),
            ownGoals: p.ownGoals - p.errorsAllowed,
            savesMade: p.savesMade,
            shotsFaced: p.shotsFaced,
            stealsTaken: p.stealsTaken,
            saves: `${p.savesMade} / ${p.shotsFaced}`,
        }
    }).sort((a, b) => {
        if (a.shotsFaced === b.shotsFaced) {
            return b.steals - a.steals;
        }
        return b.shotsFaced - a.shotsFaced;
    });
    return { headers, rows };
}

function tablePossession(allPlayerMap, team) {
    const headers = [
        { key: "name", name: "Player" },
        { key: "timeClock", name: "T.O.P." },
        { key: "perTeam", name: "% of Team" },
        { key: "perMatch", name: "% of Match" },
    ];
    const playerMap = allPlayerMap[team];
    const otherPlayerMap = allPlayerMap[team === "red" ? "blue" : "red"];
    const ourTotalTOP = toList(playerMap).reduce((agg, p) => {
        return agg + p.timePossessed;
    }, 0);
    const oppTotalTOP = toList(otherPlayerMap).reduce((agg, p) => {
        return agg + p.timePossessed;
    }, 0);
    const matchTotalTOP = ourTotalTOP + oppTotalTOP;
    const rowsTOP = toList(playerMap).concat([{
        name: `${firstCap(team)} Team`,
        timePossessed: ourTotalTOP,
    }]);
    const rows = rowsTOP.map((p) => {
        return {
            name: limitChars(p.name, 20),
            timePossessed: p.timePossessed,
            timeClock: toClock(p.timePossessed),
            perTeam: toPct(p.timePossessed, ourTotalTOP),
            perMatch: toPct(p.timePossessed, matchTotalTOP),
        }
    }).sort((a, b) => {
        return b.timePossessed - a.timePossessed;
    });
    return { headers, rows };
}

class LiveMain extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isLoading: props.stadiums ? false : true,
            data: initializeData(),
            ref: null,
            listener: null,
            interval: null,
            newStreamIdMsg: "",
        };
        if (props.streamName && props.streamId) {
            let currentData = this.state.data;
            let queue = [];
            const ref = db.ref(`live/${props.streamName}/${props.streamId}`).orderByKey();
            const listener = ref.on("child_added", (snap) => {
                const val = snap.val();
                queue.push(val);
            });
            const interval = setInterval(() => {
                if(queue.length > 0) {
                    const val = queue.shift();
                    currentData = reduceLive({ ...currentData }, val, props.stadiums);
                    this.setState({ data: currentData });
                }
            }, 5);
            this.setState({ ref, listener, interval });
        }
    }
    componentWillUnmount() {
        if (this.state.ref && this.state.listener) {
            this.state.ref.off("child_added", this.state.listener);
        }
        if (this.state.interval) {
            clearInterval(this.state.interval);
        }
    }
    render() {
        const component = this;
        const isLoading = this.state.isLoading;
        const hasStream = this.props.streamName && this.props.streamId;
        const d = this.state.data;
        const stadium = d.stadium ? this.props.stadiums[d.stadium] || {} : {};
        const hasStadium = Object.keys(stadium).length > 0;
        const clockLabel = d.isFinal ? "Final" : "Live";
        let problemEl;
        let message;
        if (this.props.problem) {
            message = this.props.problem;
        } else if (!hasStream) {
            message = "No stream name/ID provided.";
        } else if (!d.stadium) {
            message = "No stadium provided from match livestream.";
        } else if (!(d.stadium in this.props.stadiums)) {
            message = `Stadium map data not available for: ${d.stadium}`;
        }
        if (message) {
            problemEl = <p>{message}</p>
        }
        return (
            <div className={`MainContainer Live ${isLoading ? "Loading" : ""}`}>
                <div className="Loader">
                    <div class="lds"><div></div><div></div><div></div></div>
                </div>
                <div className="LiveHeader">
                    <div className="GameBox">
                        <div className="ClockBox">
                            <span className={`BoxIcon ${clockLabel}`}>{clockLabel}</span>
                            <span className="Clock">{toClock(d.time)} {d.isOT ? "OT" : ""}</span>
                        </div>
                        <span>{d.stadium ? d.stadium : "No Stadium"}</span>
                        <div className="ScoreBox">
                            <span className="BoxIcon Red">Red</span>
                            <span className="Score">{d.score.red} - {d.score.blue}</span>
                            <span className="BoxIcon Blue">Blue</span>
                        </div>
                    </div>
                </div>
                <div className="FakeHeader"></div>
                <div className="StreamPicker">
                    { problemEl }
                    <input
                        type="text"
                        placeholder="Stream Name"
                        style={{display: this.props.streamName ? "none" : "block"}}
                        onKeyPress={(e) => {
                            const code = e.keyCode ? e.keyCode : e.which;
                            if (code === 13) {
                                const name = e.target.value;
                                component.props.onStreamChange(name);   
                            }
                        }}
                    />
                </div>
                <div className="CardField" style={{display: hasStadium ? "block" : "none"}}>
                    <h3>Shots on Goal</h3>
                    <Field stadium={stadium} kicks={d.kicks} />
                </div>
                <section>
                    <div className="Halves">
                        <div className="Half">
                            <div class="Card">
                                <StatsTable
                                    table={tableOffense(d.players.red)}
                                    title="Red Offense"
                                />
                            </div>
                        </div>
                        <div className="Half">
                            <div class="Card">
                                <StatsTable
                                    table={tableOffense(d.players.blue)}
                                    title="Blue Offense"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="Halves">
                        <div className="Half">
                            <div class="Card">
                                <StatsTable
                                    table={tableDefense(d.players.red)}
                                    title="Red Defense"
                                />
                            </div>
                        </div>
                        <div className="Half">
                            <div class="Card">
                                <StatsTable
                                    table={tableDefense(d.players.blue)}
                                    title="Blue Defense"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="Halves">
                        <div className="Half">
                            <div class="Card">
                                <StatsTable
                                    table={tablePossession(d.players, "red")}
                                    title="Red Time of Possession"
                                />
                            </div>
                        </div>
                        <div className="Half">
                            <div class="Card">
                                <StatsTable
                                    table={tablePossession(d.players, "blue")}
                                    title="Blue Time of Possession"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="CardFake">
                        <p>Processed {plur(d.nEvents, "event")}.</p>
                    </div>
                </section>
                <section style={{display: this.props.streamName ? "block" : "none"}}>
                    <div className="CardFake">
                        <div className="Picker">
                            <span className="Sub">
                                <span className="Label Bold">Get Stream by Match ID: </span>
                                <input
                                    type="text"
                                    placeholder="Match ID"
                                    onKeyPress={(e) => {
                                        const code = e.keyCode ? e.keyCode : e.which;
                                        if (code === 13) {
                                            const mid = e.target.value;
                                            const streamName = component.props.streamName;
                                            component.setState({ isLoading: true });
                                            maybeGetStreamId(streamName, mid, (newStreamId) => {
                                                if (newStreamId) {
                                                    const msg = `Found stream ID... loading data.`;
                                                    component.setState({ newStreamIdMsg: msg });
                                                    component.props.setNewStreamId(newStreamId);    
                                                } else {
                                                    const msg = `No stream ID found for match ID ${mid} in stream ${streamName}.`;
                                                    component.setState({ newStreamIdMsg: msg });
                                                }
                                                component.setState({ isLoading: false });
                                            });
                                        }
                                    }}
                                />
                                <span style={{marginLeft: "10px"}}>{this.state.newStreamIdMsg}</span>
                            </span>
                        </div>
                    </div>
                </section>
            </div>
        );
    }
}

function maybeGetStreamId(checkStream, mid, callback) {
    db.ref(`live/${checkStream}`).once("value", (parentSnap) => {
        const nStreamIds = parentSnap.numChildren();
        let failures = 0;
        parentSnap.forEach((childSnap) => {
            const childRef = db.ref(`live/${checkStream}/${childSnap.key}`);
            const queryRef = childRef.orderByChild("message").equalTo(`Match ID: ${mid}`).limitToLast(1);
            queryRef.once("value", (snap) => {
                const val = snap.val();
                if (val) {
                    callback(childSnap.key);
                } else {
                    failures++;
                    if (failures >= nStreamIds) {
                        callback(null);
                    }
                }
            });
        });
    });
}

// This one came before it: live/live/-MQjwDHJP15yYxzlXUOz
// Check this one for wrong victory: live/live/-MQjxK8rB1--Pt54B1ii
// const streamName = "live";
// const streamId = "-MQjk-mRG7Rsko0XBXLc";
// For testing Match ID to Stream ID:
// const checkStream = "futsal_34";
// const mid = "-MQrXcxgqh0VUfjF14A_";
// Should be: -MQrXJwFp_IHtVE6qu3Z

const url = document.location.href;
let streamName = getParam(url, "n");
let streamId = getParam(url, "i");
let matchId = getParam(url, "m");
let liveRef;
let liveListener;

function renderMain(name, id, stadiums, msg=null) {
    const mainEl = document.getElementById("main");
    const mainRe = (
        <LiveMain
            streamName={name}
            streamId={id}
            stadiums={stadiums}
            onStreamChange={(newStreamName) => {
                streamName = newStreamName
                start(stadiums);
            }}
            setNewStreamId={(newStreamId) => {
                streamId = newStreamId
                start(stadiums);
            }}
            problem={msg}
        />
    );
    ReactDOM.unmountComponentAtNode(mainEl);
    ReactDOM.render(mainRe, mainEl);
}

function start(stadiums) {
    if (liveRef && liveListener) {
        liveRef.off("child_added", liveListener);
    }
    if (!streamName) {
        renderMain(null, null, stadiums);
    } else if (matchId) {
        maybeGetStreamId(streamName, matchId, (newStreamId) => {
            if (newStreamId) {
                streamId = newStreamId
                renderMain(streamName, streamId, stadiums);
            } else {
                const msg = `The match ID ${matchId} was not found in the live stream for ${streamName}.`;
                renderMain(null, null, stadiums, msg);
            }
        });
    } else if (streamId) {
        renderMain(streamName, streamId, stadiums);    
    } else {
        liveRef = db.ref(`live/${streamName}`).orderByKey().limitToLast(1);
        liveListener = liveRef.on("child_added", (snap) => {
            if (snap.key !== streamId) {
                streamId = snap.key;
                renderMain(streamName, streamId, stadiums);
            }
        });    
    }
}

renderMain(null, null, null);
loadStadiumData().then((stadiums) => {
    start(stadiums);
}).catch((err) => {
    console.log("Error loading stadium data:");
    console.error(err);
});
