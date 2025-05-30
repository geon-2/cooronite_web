import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaLocationCrosshairs } from 'react-icons/fa6';
import { drawParkingAllowedZone, drawPredefinedParkingLots } from './mapUtils';
import { initializeLocationTracking, recenterToMyLocation } from './locationUtils';
import seoulData from '../data/parkinglot_s.json';
import gyeonggiData from '../data/parkinglot_g.json';

const App = () => {
    const mapRef = useRef(null);
    const refs = useRef({
        overlayRef: null,
        circleRef: null,
        watchIdRef: null,
        lastLocationRef: null
    });
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(() => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const { latitude, longitude, accuracy } = pos.coords;
                        const latlng = new window.kakao.maps.LatLng(latitude, longitude);
                        const container = document.getElementById('map');
                        const map = new window.kakao.maps.Map(container, { center: latlng, level: 3 });

                        mapRef.current = map;
                        initializeLocationTracking(map, refs, latitude, longitude, accuracy);
                        drawParkingAllowedZone(map);
                        drawPredefinedParkingLots(map, seoulData, gyeonggiData);

                        setLoaded(true);

                        window.kakao.maps.event.addListener(map, 'dragend', () => {
                            drawParkingAllowedZone(map);
                        });
                    },
                    (err) => {
                        alert('위치 정보를 가져올 수 없습니다.');
                        console.error(err);
                    },
                    { enableHighAccuracy: true }
                );
            });
        }

        return () => {
            if (refs.current.watchIdRef) {
                navigator.geolocation.clearWatch(refs.current.watchIdRef);
            }
        };
    }, []);

    return (
        <Container>
            <Map id="map" />
            {loaded && (
                <LocateButton onClick={() => recenterToMyLocation(mapRef, refs)}>
                    <FaLocationCrosshairs />
                </LocateButton>
            )}
        </Container>
    );
};

const Container = styled.div`
    width: 100%;
    height: 100vh;
    position: relative;
`;

const Map = styled.div`
    width: 100%;
    height: 100%;
`;

const LocateButton = styled.button`
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: white;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 24px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    z-index: 10;
`;

export default App;
