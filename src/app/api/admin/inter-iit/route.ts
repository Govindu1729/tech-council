import { NextRequest, NextResponse } from 'next/server';
import { getAllInterIITEvents, createInterIITEvent } from '@/lib/inter-iit-storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
async function checkAdminAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return false;
  }
  return true;
}

export async function GET() {
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

  try {
    const events = await getAllInterIITEvents();
    const eventsArray = Object.values(events).sort((a, b) => 
      new Date(b.year).getTime() - new Date(a.year).getTime()
    );
    return NextResponse.json(eventsArray);
  } catch (error) {
    console.error('Error fetching Inter-IIT events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Inter-IIT events' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

  try {
    const body = await request.json();
    
    // Validate required fields
    const requiredFields = ['name', 'year', 'description', 'longDescription', 'location', 'hostIIT', 'startDate', 'endDate'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 }
        );
      }
    }
    
    // Ensure arrays are properly initialized
    const eventData = {
      ...body,
      participatingIITs: body.participatingIITs || [],
      events: body.events || [],
      overallResults: body.overallResults || [],
      teamRoster: body.teamRoster || [],
      achievements: body.achievements || [],
      highlights: body.highlights || [],
      gallery: body.gallery || [],
      documents: body.documents || []
    };
    
    const newEvent = await createInterIITEvent(eventData);
    return NextResponse.json(newEvent, { status: 201 });
  } catch (error) {
    console.error('Error creating Inter-IIT event:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create Inter-IIT event' },
      { status: 500 }
    );
  }
}
