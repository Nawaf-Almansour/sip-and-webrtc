import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Call from './pages/Call';
import Meeting from './pages/Meeting';
import JoinMeeting from './pages/JoinMeeting';
import WaitingRoom from './pages/WaitingRoom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/call/:callId" element={<Call />} />
        <Route path="/meeting/:meetingId" element={<Meeting />} />
        <Route path="/join/:meetingId" element={<JoinMeeting />} />
        <Route path="/waiting/:meetingId" element={<WaitingRoom />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
